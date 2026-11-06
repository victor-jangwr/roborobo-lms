-- 로보로보 LMS · 테스트 서버 설정 (Supabase 무료 플랜)
-- Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여 넣고 Run 을 누르세요.
-- 여러 번 실행해도 괜찮습니다. 표 이름은 모두 lms_ 로 시작해서 다른 프로젝트 표와 섞이지 않습니다.

create extension if not exists pgcrypto;

-- ── 지점 · 계정 ───────────────────────────────────────────
create table if not exists lms_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default upper(substr(md5(random()::text), 1, 6)),  -- 선생님 가입용 학원 코드
  created_at timestamptz not null default now()
);

create table if not exists lms_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid not null references lms_branches(id) on delete cascade,
  role text not null check (role in ('owner', 'teacher', 'kiosk')),
  teacher_id text,            -- LMS 안의 강사 id (원장이 설정에서 연결)
  email text,
  name text,
  created_at timestamptz not null default now()
);

-- ── LMS 데이터 (반·학생·출결·보강·청구·상담·메신저 …) ──────────────
-- 테스트 단계에서는 화면 구조를 바꾸기 쉽도록 종류(kind)별 JSON 으로 저장합니다.
create table if not exists lms_records (
  branch_id uuid not null references lms_branches(id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (branch_id, kind, id)
);

-- ── 문자 발송 대기열: 휴대폰 앱이 가져가서 보냅니다 ──────────────────
create table if not exists lms_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references lms_branches(id) on delete cascade,
  sms_id text unique,          -- lms_records(kind='sms') 의 id
  to_phone text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  error text,
  device text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists lms_sms_outbox_q on lms_sms_outbox (branch_id, status, created_at);

-- 휴대폰 앱이 살아 있는지 표시
create table if not exists lms_devices (
  branch_id uuid not null references lms_branches(id) on delete cascade,
  device text not null,
  last_seen timestamptz not null default now(),
  primary key (branch_id, device)
);

-- ── 내 지점 · 역할 ─────────────────────────────────────────
create or replace function lms_my_branch() returns uuid language sql stable security definer set search_path = public as
$$ select branch_id from lms_members where user_id = auth.uid() $$;
create or replace function lms_my_role() returns text language sql stable security definer set search_path = public as
$$ select role from lms_members where user_id = auth.uid() $$;

-- ── 권한 (RLS): 같은 지점 사람만 보고, 강사는 수납·할인 기록을 못 봄 ─────────
alter table lms_branches enable row level security;
alter table lms_members enable row level security;
alter table lms_records enable row level security;
alter table lms_sms_outbox enable row level security;
alter table lms_devices enable row level security;

drop policy if exists br_sel on lms_branches;
create policy br_sel on lms_branches for select using (id = lms_my_branch());
drop policy if exists br_upd on lms_branches;
create policy br_upd on lms_branches for update using (id = lms_my_branch() and lms_my_role() = 'owner');

drop policy if exists mb_sel on lms_members;
create policy mb_sel on lms_members for select using (branch_id = lms_my_branch());
drop policy if exists mb_upd on lms_members;
create policy mb_upd on lms_members for update using (branch_id = lms_my_branch() and lms_my_role() = 'owner')
  with check (branch_id = lms_my_branch());
drop policy if exists mb_del on lms_members;
create policy mb_del on lms_members for delete using (branch_id = lms_my_branch() and lms_my_role() = 'owner' and user_id <> auth.uid());

drop policy if exists rc_all on lms_records;
create policy rc_all on lms_records for all
  using (branch_id = lms_my_branch() and (lms_my_role() <> 'teacher' or kind not in ('payments', 'discountRules', 'studentDiscounts')))
  with check (branch_id = lms_my_branch() and (lms_my_role() <> 'teacher' or kind not in ('payments', 'discountRules', 'studentDiscounts')));

drop policy if exists ob_sel on lms_sms_outbox;
create policy ob_sel on lms_sms_outbox for select using (branch_id = lms_my_branch());

drop policy if exists dv_sel on lms_devices;
create policy dv_sel on lms_devices for select using (branch_id = lms_my_branch());

-- ── 문자 기록이 생기면 대기열에 넣기 (queue=true 인 것만) ────────────────
create or replace function lms_enqueue_sms() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'sms' and coalesce(new.data->>'queue', 'false') = 'true'
     and coalesce(new.data->>'status', 'queued') = 'queued'
     and coalesce(new.data->>'sendTo', '') <> '' then
    insert into lms_sms_outbox (branch_id, sms_id, to_phone, body)
    values (new.branch_id, new.id, new.data->>'sendTo', new.data->>'text')
    on conflict (sms_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists lms_records_sms on lms_records;
create trigger lms_records_sms after insert or update on lms_records for each row execute function lms_enqueue_sms();

-- 발송 결과를 LMS 문자 기록에 반영
create or replace function lms_sms_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.sms_id is not null then
    update lms_records
       set data = data || jsonb_build_object('status', new.status, 'ok', new.status <> 'failed', 'error', new.error, 'sentAt', new.sent_at),
           updated_at = now(), updated_by = null
     where branch_id = new.branch_id and kind = 'sms' and id = new.sms_id;
  end if;
  return new;
end $$;
drop trigger if exists lms_outbox_status on lms_sms_outbox;
create trigger lms_outbox_status after update on lms_sms_outbox for each row execute function lms_sms_status();

-- ── 화면에서 부르는 함수 ───────────────────────────────────────
-- 내 계정 정보
create or replace function lms_me() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('branch_id', m.branch_id, 'role', m.role, 'teacher_id', m.teacher_id,
                           'branch_name', b.name, 'join_code', case when m.role = 'owner' then b.join_code end)
    from lms_members m join lms_branches b on b.id = m.branch_id where m.user_id = auth.uid()
$$;

-- 새 학원 만들기 (만든 사람이 원장)
create or replace function lms_create_branch(p_name text) returns json language plpgsql security definer set search_path = public as $$
declare b lms_branches;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if exists (select 1 from lms_members where user_id = auth.uid()) then raise exception '이미 학원에 속한 계정이에요'; end if;
  insert into lms_branches (name) values (p_name) returning * into b;
  insert into lms_members (user_id, branch_id, role, email) values (auth.uid(), b.id, 'owner', auth.jwt()->>'email');
  return lms_me();
end $$;

-- 학원 코드로 참여 (선생님 · 출결 태블릿)
create or replace function lms_join_branch(p_code text, p_name text, p_role text default 'teacher') returns json language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if exists (select 1 from lms_members where user_id = auth.uid()) then raise exception '이미 학원에 속한 계정이에요'; end if;
  if p_role not in ('teacher', 'kiosk') then raise exception '역할이 올바르지 않아요'; end if;
  select id into bid from lms_branches where join_code = upper(trim(p_code));
  if bid is null then raise exception '학원 코드를 찾을 수 없어요'; end if;
  insert into lms_members (user_id, branch_id, role, email, name) values (auth.uid(), bid, p_role, auth.jwt()->>'email', p_name);
  return lms_me();
end $$;

-- 전화가 오면 학부모 찾기 (휴대폰 앱)
create or replace function lms_lookup_caller(p_phone text) returns table (student_name text, parent_name text, grade text)
language sql stable security definer set search_path = public as $$
  select data->>'name', data->>'parentName', data->>'grade'
    from lms_records
   where branch_id = lms_my_branch() and kind = 'students'
     and coalesce(data->>'status', '') <> 'left'
     and regexp_replace(coalesce(data->>'parentPhone', ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
     and length(regexp_replace(p_phone, '\D', '', 'g')) >= 9
$$;

-- 휴대폰 앱: 보낼 문자 가져가기 (여러 대가 동시에 가져가도 겹치지 않음)
create or replace function lms_claim_sms(p_device text, p_limit int default 5) returns setof lms_sms_outbox
language plpgsql security definer set search_path = public as $$
declare bid uuid := lms_my_branch();
begin
  if bid is null or lms_my_role() <> 'owner' then raise exception '원장 계정으로 로그인해 주세요'; end if;
  insert into lms_devices (branch_id, device, last_seen) values (bid, p_device, now())
    on conflict (branch_id, device) do update set last_seen = now();
  -- 2분 넘게 '보내는 중'에 멈춘 문자는 다시 대기로
  update lms_sms_outbox set status = 'queued', device = null
   where branch_id = bid and status = 'sending' and claimed_at < now() - interval '2 minutes';
  return query
    update lms_sms_outbox o set status = 'sending', device = p_device, claimed_at = now()
     where o.id in (select id from lms_sms_outbox where branch_id = bid and status = 'queued'
                     order by created_at limit p_limit for update skip locked)
    returning o.*;
end $$;

-- 휴대폰 앱: 발송 결과 알리기
create or replace function lms_finish_sms(p_id uuid, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = public as $$
  update lms_sms_outbox set status = case when p_ok then 'sent' else 'failed' end, error = p_error,
         sent_at = case when p_ok then now() end
   where id = p_id and branch_id = lms_my_branch()
$$;

-- 실패한 문자 다시 보내기 (LMS 화면)
create or replace function lms_retry_sms(p_sms_id text) returns void language sql security definer set search_path = public as $$
  update lms_sms_outbox set status = 'queued', error = null, device = null where sms_id = p_sms_id and branch_id = lms_my_branch()
$$;

-- ── 실시간 반영 ───────────────────────────────────────────
do $$ begin
  begin alter publication supabase_realtime add table lms_records; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lms_sms_outbox; exception when duplicate_object then null; end;
end $$;

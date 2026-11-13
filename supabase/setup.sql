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

-- ════════════════════════════════════════════════════════════════
-- 가맹 본사 (2026-11 추가) — 이 아래만 다시 실행해도 됩니다.
-- 본사(org) 아래에 지점(직영·가맹)이 있고, 지점마다 로열티 계약과 월 정산서가 있습니다.
-- ════════════════════════════════════════════════════════════════
create table if not exists lms_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table lms_branches add column if not exists org_id uuid references lms_orgs(id) on delete set null;
alter table lms_branches add column if not exists kind text not null default 'franchise';
alter table lms_branches add column if not exists owner_code text unique;   -- 점주 가입용 초대 코드
alter table lms_branches add column if not exists region text;

create table if not exists lms_hq_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references lms_orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table if not exists lms_contracts (
  branch_id uuid primary key references lms_branches(id) on delete cascade,
  org_id uuid not null references lms_orgs(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists lms_settlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references lms_orgs(id) on delete cascade,
  branch_id uuid not null references lms_branches(id) on delete cascade,
  month text not null,                 -- YYYY-MM
  amount bigint not null,              -- 합계 (부가세 포함)
  data jsonb not null,                 -- 계산 내역
  status text not null default 'issued' check (status in ('issued', 'confirmed', 'paid', 'void')),
  issued_at timestamptz not null default now(),
  confirmed_at timestamptz,
  paid_at timestamptz,
  paid_note text,
  unique (branch_id, month)
);

create table if not exists lms_charges (   -- 그 달만 붙는 청구 (교재·키트 주문 등)
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references lms_orgs(id) on delete cascade,
  branch_id uuid not null references lms_branches(id) on delete cascade,
  month text not null,
  name text not null,
  amount bigint not null,
  created_at timestamptz not null default now()
);

create or replace function lms_my_orgs() returns setof uuid language sql stable security definer set search_path = public as
$$ select org_id from lms_hq_members where user_id = auth.uid() $$;
create or replace function lms_is_hq_of(b uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from lms_branches br join lms_hq_members h on h.org_id = br.org_id where br.id = b and h.user_id = auth.uid()) $$;

alter table lms_orgs enable row level security;
alter table lms_hq_members enable row level security;
alter table lms_contracts enable row level security;
alter table lms_settlements enable row level security;
alter table lms_charges enable row level security;

drop policy if exists og_sel on lms_orgs;
create policy og_sel on lms_orgs for select using (id in (select lms_my_orgs()) or id = (select org_id from lms_branches where id = lms_my_branch()));
drop policy if exists hm_sel on lms_hq_members;
create policy hm_sel on lms_hq_members for select using (org_id in (select lms_my_orgs()));

-- 본사는 소속 지점을 보고 이름·종류·지역을 바꿀 수 있음
drop policy if exists br_hq_sel on lms_branches;
create policy br_hq_sel on lms_branches for select using (org_id in (select lms_my_orgs()));
drop policy if exists br_hq_upd on lms_branches;
create policy br_hq_upd on lms_branches for update using (org_id in (select lms_my_orgs())) with check (org_id in (select lms_my_orgs()));
drop policy if exists mb_hq_sel on lms_members;
create policy mb_hq_sel on lms_members for select using (lms_is_hq_of(branch_id));

-- 본사가 읽을 수 있는 지점 데이터: 학생 명단·반·수강·출결·청구·수납 (상담·메신저·문자는 지점만)
drop policy if exists rc_hq_sel on lms_records;
create policy rc_hq_sel on lms_records for select using (
  lms_is_hq_of(branch_id) and kind in ('students', 'enrollments', 'classes', 'teachers', 'terms', 'attendances', 'invoices', 'payments', 'products', 'settings'));

drop policy if exists ct_hq on lms_contracts;
create policy ct_hq on lms_contracts for all using (org_id in (select lms_my_orgs())) with check (org_id in (select lms_my_orgs()) and lms_is_hq_of(branch_id));
drop policy if exists ct_br on lms_contracts;
create policy ct_br on lms_contracts for select using (branch_id = lms_my_branch() and lms_my_role() = 'owner');

drop policy if exists st_hq on lms_settlements;
create policy st_hq on lms_settlements for all using (org_id in (select lms_my_orgs())) with check (org_id in (select lms_my_orgs()) and lms_is_hq_of(branch_id));
drop policy if exists st_br on lms_settlements;
create policy st_br on lms_settlements for select using (branch_id = lms_my_branch() and lms_my_role() = 'owner' and status <> 'void');

drop policy if exists cg_hq on lms_charges;
create policy cg_hq on lms_charges for all using (org_id in (select lms_my_orgs())) with check (org_id in (select lms_my_orgs()) and lms_is_hq_of(branch_id));
drop policy if exists cg_br on lms_charges;
create policy cg_br on lms_charges for select using (branch_id = lms_my_branch() and lms_my_role() = 'owner');

-- 내 계정 정보 (본사 정보 포함)
create or replace function lms_me() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('branch_id', m.branch_id, 'role', m.role, 'teacher_id', m.teacher_id,
                           'branch_name', b.name, 'join_code', case when m.role = 'owner' then b.join_code end,
                           'branch_kind', b.kind, 'org_id', b.org_id, 'org_name', o.name,
                           'hq_org_id', (select h.org_id from lms_hq_members h where h.user_id = auth.uid() limit 1))
    from lms_members m join lms_branches b on b.id = m.branch_id left join lms_orgs o on o.id = b.org_id
   where m.user_id = auth.uid()
$$;

-- 본사 만들기: 지금 원장인 지점이 직영점이 되고, 이 계정이 본사 관리자가 됨
create or replace function lms_create_org(p_name text) returns json language plpgsql security definer set search_path = public as $$
declare bid uuid := lms_my_branch(); oid uuid;
begin
  if bid is null or lms_my_role() <> 'owner' then raise exception '원장 계정으로 로그인해 주세요'; end if;
  if (select org_id from lms_branches where id = bid) is not null then raise exception '이미 본사에 속한 지점이에요'; end if;
  insert into lms_orgs (name) values (p_name) returning id into oid;
  update lms_branches set org_id = oid, kind = 'direct' where id = bid;
  insert into lms_hq_members (user_id, org_id) values (auth.uid(), oid);
  return lms_me();
end $$;

-- 본사: 새 가맹 지점 만들기 → 점주 초대 코드 발급, 기본 계약 생성
create or replace function lms_hq_create_branch(p_name text, p_region text, p_contract jsonb) returns json language plpgsql security definer set search_path = public as $$
declare oid uuid; b lms_branches;
begin
  select org_id into oid from lms_hq_members where user_id = auth.uid() limit 1;
  if oid is null then raise exception '본사 관리자만 지점을 만들 수 있어요'; end if;
  insert into lms_branches (name, org_id, kind, region, owner_code)
  values (p_name, oid, 'franchise', p_region, upper(substr(md5(random()::text), 1, 8))) returning * into b;
  insert into lms_contracts (branch_id, org_id, data) values (b.id, oid, p_contract);
  return json_build_object('id', b.id, 'name', b.name, 'owner_code', b.owner_code);
end $$;

-- 학원 코드로 참여: 선생님·출결 태블릿은 학원 코드, 점주는 본사가 준 점주 코드
create or replace function lms_join_branch(p_code text, p_name text, p_role text default 'teacher') returns json language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if exists (select 1 from lms_members where user_id = auth.uid()) then raise exception '이미 학원에 속한 계정이에요'; end if;
  if p_role = 'owner' then
    select id into bid from lms_branches where owner_code = upper(trim(p_code));
    if bid is null then raise exception '점주 코드를 찾을 수 없어요'; end if;
    if exists (select 1 from lms_members where branch_id = bid and role = 'owner') then raise exception '이미 점주가 등록된 지점이에요'; end if;
  elsif p_role in ('teacher', 'kiosk') then
    select id into bid from lms_branches where join_code = upper(trim(p_code));
    if bid is null then raise exception '학원 코드를 찾을 수 없어요'; end if;
  else
    raise exception '역할이 올바르지 않아요';
  end if;
  insert into lms_members (user_id, branch_id, role, email, name) values (auth.uid(), bid, p_role, auth.jwt()->>'email', p_name);
  return lms_me();
end $$;

-- 점주: 정산서 확인
create or replace function lms_confirm_settlement(p_id uuid) returns void language sql security definer set search_path = public as $$
  update lms_settlements set status = 'confirmed', confirmed_at = now()
   where id = p_id and status = 'issued' and branch_id = lms_my_branch() and lms_my_role() = 'owner'
$$;

do $$ begin
  begin alter publication supabase_realtime add table lms_settlements; exception when duplicate_object then null; end;
end $$;

-- ════════════════════════════════════════════════════════════════
-- 온라인 결제 (2026-11 추가) — 토스페이먼츠 결제 링크
-- 학부모는 로그인 없이 링크로 결제하고, 승인은 Edge Function(lms-pay-confirm)이 처리합니다.
-- ════════════════════════════════════════════════════════════════
create table if not exists lms_pay_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  branch_id uuid not null references lms_branches(id) on delete cascade,
  invoice_id text not null,
  order_id text not null unique,
  amount bigint not null check (amount > 0),
  order_name text not null,
  customer_name text,
  status text not null default 'ready' check (status in ('ready', 'paid', 'canceled')),
  payment_key text,
  method text,
  receipt_url text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
alter table lms_pay_links enable row level security;
drop policy if exists pl_sel on lms_pay_links;
create policy pl_sel on lms_pay_links for select using (branch_id = lms_my_branch());
drop policy if exists pl_upd on lms_pay_links;
create policy pl_upd on lms_pay_links for update using (branch_id = lms_my_branch() and lms_my_role() = 'owner');

-- 원장: 청구서 결제 링크 만들기 (같은 청구·금액의 링크가 있으면 다시 씀)
create or replace function lms_create_pay_link(p_invoice_id text, p_amount bigint, p_order_name text, p_customer text) returns json
language plpgsql security definer set search_path = public as $$
declare bid uuid := lms_my_branch(); l lms_pay_links;
begin
  if bid is null or lms_my_role() <> 'owner' then raise exception '원장 계정만 결제 링크를 만들 수 있어요'; end if;
  if not exists (select 1 from lms_records where branch_id = bid and kind = 'invoices' and id = p_invoice_id) then raise exception '청구서를 찾을 수 없어요'; end if;
  select * into l from lms_pay_links where branch_id = bid and invoice_id = p_invoice_id and amount = p_amount and status = 'ready' and expires_at > now() limit 1;
  if l.token is null then
    insert into lms_pay_links (branch_id, invoice_id, order_id, amount, order_name, customer_name)
    values (bid, p_invoice_id, 'lms-' || replace(gen_random_uuid()::text, '-', ''), p_amount, left(p_order_name, 90), p_customer)
    returning * into l;
  end if;
  return json_build_object('token', l.token, 'order_id', l.order_id, 'amount', l.amount, 'expires_at', l.expires_at);
end $$;

-- 학부모 결제 화면: 링크 정보 (로그인 없이)
create or replace function lms_pay_info(p_token text) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('order_id', l.order_id, 'amount', l.amount, 'order_name', l.order_name,
    'customer_name', case when length(coalesce(l.customer_name, '')) >= 2 then left(l.customer_name, 1) || repeat('*', length(l.customer_name) - 2) || right(l.customer_name, 1) else l.customer_name end,
    'status', case when l.status = 'ready' and l.expires_at < now() then 'expired' else l.status end,
    'academy', coalesce((select r.data->>'academyName' from lms_records r where r.branch_id = l.branch_id and r.kind = 'settings' and r.id = 'main'), b.name),
    'client_key', (select r.data->>'tossClientKey' from lms_records r where r.branch_id = l.branch_id and r.kind = 'settings' and r.id = 'main'),
    'receipt_url', l.receipt_url, 'approved_at', l.approved_at)
  from lms_pay_links l join lms_branches b on b.id = l.branch_id where l.token = p_token
$$;
grant execute on function lms_pay_info(text) to anon;

-- 결제 링크 여러 개 한 번에 만들기 (원장) — p_items: [{invoice_id, amount, order_name, customer}]
create or replace function lms_create_pay_links(p_items jsonb) returns json language plpgsql security definer set search_path = public as $$
declare it jsonb; out jsonb := '[]'::jsonb; r json;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    r := lms_create_pay_link(it->>'invoice_id', (it->>'amount')::bigint, it->>'order_name', it->>'customer');
    out := out || jsonb_build_array(jsonb_build_object('invoice_id', it->>'invoice_id') || r::jsonb);
  end loop;
  return out;
end $$;

-- ════════════════════════════════════════════════════════════════
-- 상담 통화 녹음 (2026-11 추가) — 학원폰 앱이 녹음을 올리면 Edge Function(lms-call-summarize)이
-- Gemini 로 글·요약을 만들어 상담 '검토 대기'에 넣고, 녹음 파일은 바로 지웁니다.
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('call-recordings', 'call-recordings', false) on conflict (id) do nothing;

drop policy if exists "lms call upload" on storage.objects;
create policy "lms call upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = lms_my_branch()::text and lms_my_role() = 'owner');

-- 휴대폰 앱: 지금 녹음을 올려도 되는지 (끄기 / 테스트: 등록 번호만 / 전체)
create or replace function lms_call_policy() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'branch_id', lms_my_branch(),
    'mode', coalesce((select data->>'callUploadMode' from lms_records where branch_id = lms_my_branch() and kind = 'settings' and id = 'main'), 'off'),
    'numbers', coalesce((select data->'callTestNumbers' from lms_records where branch_id = lms_my_branch() and kind = 'settings' and id = 'main'), '[]'::jsonb))
$$;

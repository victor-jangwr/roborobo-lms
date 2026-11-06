-- 로보로보 LMS · Supabase 스키마 (1차)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요.
-- 모든 테이블에 branch_id(지점)가 있어 가맹 확장 시 지점별로 데이터가 분리됩니다.

create extension if not exists "pgcrypto";

-- ── 지점·사용자 ─────────────────────────────────────────
create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz default now()
);

create type app_role as enum ('hq', 'owner', 'teacher', 'kiosk');

create table teachers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  phone text,
  color text not null default '#3B6EE6',
  active boolean not null default true
);

-- 로그인 계정 ↔ 역할·지점 연결 (auth.users 1명당 1행)
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references branches(id),          -- 본사(hq)는 null 가능
  role app_role not null,
  teacher_id uuid references teachers(id)
);

-- ── 분기·반 ───────────────────────────────────────────
create table terms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'ready' check (status in ('ready', 'running', 'closed')),
  check (end_date > start_date)
);

create table vacations (                -- 방학·휴강: 주차 계산에서 제외
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null
);

create table products (                 -- 가격표: 정규 수강료·특강·교재
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  kind text not null check (kind in ('tuition', 'special', 'material')),
  name text not null,
  price integer not null check (price >= 0),
  period text,
  capacity integer,
  active boolean not null default true
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  term_id uuid not null references terms(id),
  name text not null,
  teacher_id uuid not null references teachers(id),
  room text,
  capacity integer not null default 8,
  product_id uuid references products(id)
);

create table class_slots (              -- 한 반의 요일·시간 (여러 개 가능)
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

-- ── 학생·수강 ─────────────────────────────────────────
create table students (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  birth_year smallint,
  grade text,
  school text,
  parent_name text,
  parent_phone text not null,
  code char(4) not null,                -- 출결 번호
  status text not null default 'active' check (status in ('active', 'paused', 'left')),
  joined_at date not null default current_date,
  memo text,
  unique (branch_id, code)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  class_id uuid not null references classes(id) on delete cascade,
  start_date date not null,
  end_date date
);

-- ── 출결·보강·문자 ─────────────────────────────────────
create table attendances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  student_id uuid not null references students(id),
  class_id uuid not null references classes(id),
  date date not null,
  status text not null check (status in ('present', 'late', 'absent')),
  check_in time,
  check_out time,
  method text not null default 'tablet' check (method in ('tablet', 'manual')),
  is_makeup boolean not null default false,
  note text
);
create index on attendances (branch_id, date);

create table makeups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  attendance_id uuid not null references attendances(id) on delete cascade,
  student_id uuid not null references students(id),
  class_id uuid not null references classes(id),
  absent_date date not null,
  status text not null default 'waiting' check (status in ('waiting', 'planned', 'done', 'skipped')),
  teacher_id uuid references teachers(id),
  date date, start_time time, end_time time,
  note text
);

create table sms_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  student_id uuid references students(id),
  phone text not null,
  kind text not null check (kind in ('arrive', 'leave', 'notice')),
  text text not null,
  sent_at timestamptz not null default now(),
  ok boolean not null default false,
  provider_result jsonb
);

-- ── 결제: 상품 → 청구 → 수납 ─────────────────────────────
create table discount_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  type text not null check (type in ('percent', 'amount')),
  value integer not null check (value > 0)
);

create table student_discounts (        -- 매달 자동 적용되는 고정 할인
  student_id uuid not null references students(id) on delete cascade,
  rule_id uuid not null references discount_rules(id) on delete cascade,
  primary key (student_id, rule_id)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  student_id uuid not null references students(id),
  month char(7) not null,               -- 'YYYY-MM'
  due_date date,
  created_at timestamptz default now()
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references products(id),
  label text not null,
  price integer not null,
  discounts jsonb not null default '[]'  -- [{label, amount}]
);

create table payments (                 -- 카드·계좌 번호는 저장하지 않음
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount integer not null check (amount > 0),
  method text not null check (method in ('card', 'transfer', 'cash', 'etc')),
  paid_at date not null default current_date,
  note text
);

create table settings (
  branch_id uuid primary key references branches(id),
  late_after_min integer not null default 10,
  unchecked_after_min integer not null default 10,
  arrive_window_min integer not null default 30,
  sms_arrive text not null default '[{학원}] {학생} 학생이 {시각}에 등원했습니다.',
  sms_leave text not null default '[{학원}] {학생} 학생이 {시각}에 하원했습니다.',
  academy_name text not null default '로보로보코딩랩'
);

-- ── 권한 (RLS) ────────────────────────────────────────
create or replace function my_role() returns app_role language sql stable security definer as
  $$ select role from profiles where user_id = auth.uid() $$;
create or replace function my_branch() returns uuid language sql stable security definer as
  $$ select branch_id from profiles where user_id = auth.uid() $$;
create or replace function my_teacher() returns uuid language sql stable security definer as
  $$ select teacher_id from profiles where user_id = auth.uid() $$;

-- 본사: 전체 / 원장: 내 지점 전체 / 강사: 내 지점 읽기 + 출결·보강 쓰기 / 태블릿: 직접 접근 없음(Edge Function 경유)
do $$
declare t text;
begin
  foreach t in array array['teachers','terms','products','classes','students','attendances','makeups','sms_logs','discount_rules','invoices','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy hq_all on %I for all using (my_role() = 'hq') with check (my_role() = 'hq')$p$, t);
    execute format($p$create policy owner_all on %I for all using (my_role() = 'owner' and branch_id = my_branch()) with check (my_role() = 'owner' and branch_id = my_branch())$p$, t);
  end loop;
  foreach t in array array['teachers','terms','classes','students','attendances','makeups','settings'] loop
    execute format($p$create policy teacher_read on %I for select using (my_role() = 'teacher' and branch_id = my_branch())$p$, t);
  end loop;
end $$;

create policy teacher_att on attendances for insert with check (my_role() = 'teacher' and branch_id = my_branch());
create policy teacher_att_upd on attendances for update using (my_role() = 'teacher' and branch_id = my_branch());
create policy teacher_mk on makeups for update using (my_role() = 'teacher' and branch_id = my_branch());

-- 지점 id가 없는 하위 테이블은 부모 테이블을 따라감
alter table vacations enable row level security;
create policy by_term on vacations for all using (exists (select 1 from terms t where t.id = term_id and (my_role() = 'hq' or t.branch_id = my_branch())));
alter table class_slots enable row level security;
create policy by_class on class_slots for all using (exists (select 1 from classes c where c.id = class_id and (my_role() = 'hq' or c.branch_id = my_branch())));
alter table enrollments enable row level security;
create policy by_class on enrollments for all using (exists (select 1 from classes c where c.id = class_id and (my_role() = 'hq' or c.branch_id = my_branch())));
alter table student_discounts enable row level security;
create policy by_student on student_discounts for all using (exists (select 1 from students s where s.id = student_id and (my_role() = 'hq' or (my_role() = 'owner' and s.branch_id = my_branch()))));
alter table invoice_items enable row level security;
create policy by_invoice on invoice_items for all using (exists (select 1 from invoices i where i.id = invoice_id and (my_role() = 'hq' or (my_role() = 'owner' and i.branch_id = my_branch()))));
alter table payments enable row level security;
create policy by_invoice on payments for all using (exists (select 1 from invoices i where i.id = invoice_id and (my_role() = 'hq' or (my_role() = 'owner' and i.branch_id = my_branch()))));
alter table profiles enable row level security;
create policy self_read on profiles for select using (user_id = auth.uid() or my_role() = 'hq');
alter table branches enable row level security;
create policy branch_read on branches for select using (my_role() = 'hq' or id = my_branch());

-- ── 상담 기록 (2차) ─────────────────────────────────────
create table consults (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  student_id uuid not null references students(id),
  author_teacher_id uuid references teachers(id),     -- null = 원장 작성
  date date not null, time time not null,
  channel text not null check (channel in ('call', 'visit', 'student', 'message')),
  tags text[] not null default '{}',
  summary text not null,
  parent_request text, agreed text,
  next_text text, next_due date, next_done boolean not null default false,
  owner_only boolean not null default false,          -- 원장과 작성자만 보기
  source text not null default 'manual' check (source in ('manual', 'call')),
  status text not null default 'saved' check (status in ('draft', 'saved')),  -- draft = 통화 정리 검토 대기
  call_phone text, call_duration_sec integer, call_direction text,
  transcript text,                                    -- 검토 대기 동안만 보관, 저장 시 null 로 지움
  created_at timestamptz default now()
);
create index on consults (branch_id, student_id, date desc);

alter table consults enable row level security;
create policy hq_all on consults for all using (my_role() = 'hq');
create policy owner_all on consults for all using (my_role() = 'owner' and branch_id = my_branch());
-- 강사: 이번 분기 내 반 학생의 기록만, '원장만 보기'는 본인이 쓴 것만
create policy teacher_read on consults for select using (
  my_role() = 'teacher' and branch_id = my_branch()
  and exists (select 1 from enrollments e join classes c on c.id = e.class_id
              where e.student_id = consults.student_id and e.end_date is null and c.teacher_id = my_teacher())
  and (not owner_only or author_teacher_id = my_teacher()));
create policy teacher_write on consults for insert with check (my_role() = 'teacher' and author_teacher_id = my_teacher());
create policy teacher_update on consults for update using (my_role() = 'teacher' and (author_teacher_id = my_teacher() or status = 'draft'));

-- 학원 휴대폰 앱: 수신 번호로 학부모·자녀 찾기 (앱 전용 계정이 호출, 최소 정보만 반환)
create or replace function lookup_caller(p_phone text)
returns table (parent_name text, student_name text, grade text, classes text, last_consult date, next_todo text)
language sql stable security definer as $$
  select s.parent_name, s.name, s.grade,
    (select string_agg(c.name, ', ') from enrollments e join classes c on c.id = e.class_id where e.student_id = s.id and e.end_date is null),
    (select max(date) from consults k where k.student_id = s.id and k.status = 'saved'),
    (select next_text from consults k where k.student_id = s.id and k.next_done = false and k.next_text is not null order by next_due limit 1)
  from students s
  where regexp_replace(s.parent_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    and s.status <> 'left' and s.branch_id = my_branch();
$$;

-- ── 메신저 (3차) ───────────────────────────────────────
create table channels (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null default '',
  kind text not null check (kind in ('notice', 'group', 'dm')),
  everyone boolean not null default false,            -- true = 지점 전체
  created_at timestamptz default now()
);
create table channel_members (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  primary key (channel_id, user_id)
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  author_id uuid references auth.users(id),          -- null = LMS 자동 알림
  text text not null,                                -- @[s:학생id] 토큰으로 학생 연결
  task_done boolean, task_done_by uuid,
  files jsonb,                                       -- Storage 경로 목록
  created_at timestamptz not null default now()
);
create index on messages (channel_id, created_at);
alter publication supabase_realtime add table messages;  -- 실시간 수신

alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
create policy see_channel on channels for select using (
  branch_id = my_branch() and (everyone or exists (select 1 from channel_members m where m.channel_id = id and m.user_id = auth.uid())));
create policy read_msg on messages for select using (
  exists (select 1 from channels c where c.id = channel_id and c.branch_id = my_branch()
          and (c.everyone or exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))));
create policy write_msg on messages for insert with check (
  author_id = auth.uid() and exists (select 1 from channels c where c.id = channel_id and c.branch_id = my_branch()
    and (c.kind <> 'notice' or my_role() in ('owner', 'hq'))
    and (c.everyone or exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))));
create policy my_read on channel_members for all using (user_id = auth.uid());

-- ============================================================
-- KPI System — Supabase schema
-- รันสคริปต์นี้ใน Supabase SQL Editor (Project > SQL Editor > New query)
-- ปลอดภัยที่จะรันซ้ำ (ใช้ drop/create if not exists เป็นส่วนใหญ่)
-- ============================================================

-- ---------------- enum types ----------------
do $$ begin
  create type user_role as enum ('admin', 'hr', 'ceo', 'division_head', 'dept_manager', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kpi_level as enum ('org', 'division', 'department');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assessment_status as enum ('draft', 'submitted', 'evaluated');
exception when duplicate_object then null; end $$;

-- ---------------- tables ----------------
create table if not exists companies (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists divisions (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  name          text not null,
  head_user_id  text -- FK เพิ่มทีหลัง (อ้างอิง users ซึ่งยังไม่ถูกสร้าง — วนกลับหากัน)
);

create table if not exists departments (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  division_id   text not null references divisions(id) on delete cascade,
  name          text not null,
  head_user_id  text -- FK เพิ่มทีหลัง
);

create table if not exists users (
  id            text primary key,
  company_id    text references companies(id) on delete cascade,
  emp_id        text not null,
  name          text not null,
  email         text not null unique,
  phone         text not null default '-',
  role          user_role not null,
  division_id   text references divisions(id) on delete set null,
  department_id text references departments(id) on delete set null,
  position      text not null default '',
  manager_id    text references users(id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- เติม FK ที่ค้างไว้ (divisions/departments.head_user_id → users.id) หลังจากมีตาราง users แล้ว
do $$ begin
  alter table divisions add constraint divisions_head_user_id_fkey
    foreign key (head_user_id) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table departments add constraint departments_head_user_id_fkey
    foreign key (head_user_id) references users(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists cycles (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  name       text not null,
  year       int not null,
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists kpis (
  id             text primary key,
  company_id     text not null references companies(id) on delete cascade,
  level          kpi_level not null,
  title          text not null,
  division_id    text references divisions(id) on delete cascade,
  department_id  text references departments(id) on delete cascade,
  parent_kpi_id  text references kpis(id) on delete set null,
  created_by_id  text references users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists assessments (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  cycle_id      text not null references cycles(id) on delete cascade,
  user_id       text not null references users(id) on delete cascade,
  evaluator_id  text references users(id) on delete set null,
  remark        text,
  status        assessment_status not null default 'draft',
  self_total    numeric,
  final_score   numeric,
  submitted_at  timestamptz,
  evaluated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, cycle_id)
);

create table if not exists assessment_items (
  assessment_id  text not null references assessments(id) on delete cascade,
  item_id        text not null, -- id เดิมที่ generate ฝั่ง client เช่น "as-xxx-i1"
  position       int not null default 0,
  title          text not null default '',
  weight         numeric not null default 0,
  target         text not null default '',
  linked_kpi_id  text references kpis(id) on delete set null,
  self_score     numeric not null default 0,
  self_comment   text not null default '',
  eval_score     numeric,
  eval_comment   text not null default '',
  primary key (assessment_id, item_id)
);

create table if not exists announcements (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  message       text not null,
  created_by_id text references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------------- indexes ----------------
create index if not exists idx_divisions_company on divisions(company_id);
create index if not exists idx_departments_company on departments(company_id);
create index if not exists idx_departments_division on departments(division_id);
create index if not exists idx_users_company on users(company_id);
create index if not exists idx_users_division on users(division_id);
create index if not exists idx_users_department on users(department_id);
create index if not exists idx_users_manager on users(manager_id);
create index if not exists idx_cycles_company on cycles(company_id);
create index if not exists idx_kpis_company_level on kpis(company_id, level);
create index if not exists idx_kpis_division on kpis(division_id);
create index if not exists idx_kpis_department on kpis(department_id);
create index if not exists idx_kpis_parent on kpis(parent_kpi_id);
create index if not exists idx_assessments_cycle on assessments(cycle_id);
create index if not exists idx_assessments_user on assessments(user_id);
create index if not exists idx_assessments_evaluator on assessments(evaluator_id);
create index if not exists idx_assessment_items_assessment on assessment_items(assessment_id);
create index if not exists idx_announcements_company_created on announcements(company_id, created_at desc);

-- ---------------- updated_at auto-touch ----------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assessments_updated_at on assessments;
create trigger trg_assessments_updated_at
  before update on assessments
  for each row execute function set_updated_at();

-- ---------------- row level security ----------------
-- แอปนี้เข้าถึง Supabase จากฝั่ง server เท่านั้น (Next.js Server Actions/Components)
-- โดยใช้ service_role key ซึ่ง "bypass" RLS อยู่แล้วเสมอ
-- เราเปิด RLS ไว้ที่ทุกตารางแบบไม่มี policy ให้ anon/authenticated เลย
-- เพื่อบล็อกการเข้าถึงตรงจาก client-side (เผื่อมีคน map anon key ไปใช้ผิดที่ในอนาคต)
alter table companies enable row level security;
alter table divisions enable row level security;
alter table departments enable row level security;
alter table users enable row level security;
alter table cycles enable row level security;
alter table kpis enable row level security;
alter table assessments enable row level security;
alter table assessment_items enable row level security;
alter table announcements enable row level security;

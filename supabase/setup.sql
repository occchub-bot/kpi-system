-- ============================================================
-- KPI System — Supabase setup (schema.sql + seed.sql รวมเป็นไฟล์เดียว)
-- วางทั้งไฟล์นี้ใน Supabase SQL Editor แล้วกด Run ครั้งเดียวจบ
-- ============================================================

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

-- ============================================================
-- KPI System — seed data (สร้างจาก data/store.json ของโปรเจกต์)
-- รันต่อจาก schema.sql ในไฟล์เดียวกัน (setup.sql) หรือรันแยกทีหลังก็ได้
-- ============================================================

-- companies
insert into companies (id, name, created_at) values
  ('c1', 'บริษัท สยามฟู้ดส์ อินดัสทรี จำกัด', '2026-01-10T00:00:00.000Z'),
  ('c2', 'บริษัท เอ็นเทค โซลูชันส์ จำกัด', '2026-01-10T00:00:00.000Z')
on conflict (id) do nothing;

-- users (สร้างก่อน divisions/departments เพราะ head_user_id อ้างอิงมาที่นี่)
insert into users (id, company_id, emp_id, name, email, phone, role, division_id, department_id, position, manager_id, is_active, created_at) values
  ('u-admin', null, 'ADMIN', 'ผู้ดูแลระบบ', 'admin@kpi.system', '-', 'admin', null, null, 'ผู้ดูแลระบบ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-ceo', 'c1', 'CEO-001', 'ธนกร วงศ์สถาพร', 'ceo@siamfoods.co.th', '081-213-7911', 'ceo', null, null, 'ประธานเจ้าหน้าที่บริหาร (CEO)', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-hr', 'c1', 'HR-001', 'พิมพ์ชนก ศรีสุข', 'hr@siamfoods.co.th', '081-227-5822', 'hr', null, null, 'ผู้จัดการฝ่ายทรัพยากรบุคคล', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d1-head', 'c1', 'EXE-001', 'สมชาย รุ่งเรืองกิจ', 'staff001@siamfoods.co.th', '081-241-3733', 'division_head', null, null, 'ผู้อำนวยการฝ่ายผลิต', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d1p1-mgr', 'c1', 'MGR-001', 'วีรพงษ์ ชัยมงคล', 'staff002@siamfoods.co.th', '081-255-1644', 'dept_manager', null, null, 'ผู้จัดการแผนกผลิต', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d1p1-e1', 'c1', 'EMP-001', 'นพดล แสงทอง', 'staff003@siamfoods.co.th', '081-268-9555', 'employee', null, null, 'ช่างเทคนิคการผลิต', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d1p1-e2', 'c1', 'EMP-002', 'กิตติศักดิ์ บุญมา', 'staff004@siamfoods.co.th', '081-282-7466', 'employee', null, null, 'พนักงานควบคุมเครื่องจักร', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d1p2-mgr', 'c1', 'MGR-002', 'อรวรรณ พงษ์พานิช', 'staff005@siamfoods.co.th', '081-296-5377', 'dept_manager', null, null, 'ผู้จัดการแผนกควบคุมคุณภาพ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d1p2-e3', 'c1', 'EMP-003', 'สุภาพร ทองดี', 'staff006@siamfoods.co.th', '081-310-3288', 'employee', null, null, 'เจ้าหน้าที่ควบคุมคุณภาพ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d2-head', 'c1', 'EXE-002', 'จิราพร เลิศวัฒนา', 'staff007@siamfoods.co.th', '081-324-1199', 'division_head', null, null, 'ผู้อำนวยการฝ่ายขายและการตลาด', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d2p1-mgr', 'c1', 'MGR-003', 'ประเสริฐ มั่นคง', 'staff008@siamfoods.co.th', '081-337-9110', 'dept_manager', null, null, 'ผู้จัดการแผนกขาย', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d2p1-e4', 'c1', 'EMP-004', 'ธีรเดช สุขสวัสดิ์', 'staff009@siamfoods.co.th', '081-351-7021', 'employee', null, null, 'พนักงานขาย', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d2p1-e5', 'c1', 'EMP-005', 'นภาพร ใจงาม', 'staff010@siamfoods.co.th', '081-365-4932', 'employee', null, null, 'พนักงานขาย', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d2p2-mgr', 'c1', 'MGR-004', 'วรรณภา ศิริพงศ์', 'staff011@siamfoods.co.th', '081-379-2843', 'dept_manager', null, null, 'ผู้จัดการแผนกการตลาด', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d2p2-e6', 'c1', 'EMP-006', 'พิชญา รัตนกุล', 'staff012@siamfoods.co.th', '081-393-0754', 'employee', null, null, 'เจ้าหน้าที่การตลาด', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d3-head', 'c1', 'EXE-003', 'มานพ อินทรีย์ทอง', 'staff013@siamfoods.co.th', '081-406-8665', 'division_head', null, null, 'ผู้อำนวยการฝ่ายบริหาร', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d3p1-mgr', 'c1', 'MGR-005', 'สุดารัตน์ คงเจริญ', 'staff014@siamfoods.co.th', '081-420-6576', 'dept_manager', null, null, 'ผู้จัดการแผนกบุคคล', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d3p1-e7', 'c1', 'EMP-007', 'อนันต์ พูลสวัสดิ์', 'staff015@siamfoods.co.th', '081-434-4487', 'employee', null, null, 'เจ้าหน้าที่บุคคล', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d3p2-mgr', 'c1', 'MGR-006', 'กนกพร วิไลรัตน์', 'staff016@siamfoods.co.th', '081-448-2398', 'dept_manager', null, null, 'ผู้จัดการแผนกบัญชีและการเงิน', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c1-d3p2-e8', 'c1', 'EMP-008', 'ปรีชา ธนวัฒน์', 'staff017@siamfoods.co.th', '081-462-0309', 'employee', null, null, 'เจ้าหน้าที่บัญชี', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-ceo', 'c2', 'CEO-001', 'วิชัย เจริญพานิช', 'ceo@entech.co.th', '081-475-8220', 'ceo', null, null, 'ประธานเจ้าหน้าที่บริหาร (CEO)', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-hr', 'c2', 'HR-001', 'รัตนาภรณ์ สมบูรณ์ทรัพย์', 'hr@entech.co.th', '081-489-6131', 'hr', null, null, 'ผู้จัดการฝ่ายทรัพยากรบุคคล', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d1-head', 'c2', 'EXE-001', 'อาทิตย์ ภักดีวงศ์', 'staff001@entech.co.th', '081-503-4042', 'division_head', null, null, 'ผู้อำนวยการฝ่ายพัฒนาผลิตภัณฑ์', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d1p1-mgr', 'c2', 'MGR-001', 'ณัฐพล ศรีวิชัย', 'staff002@entech.co.th', '081-517-1953', 'dept_manager', null, null, 'ผู้จัดการแผนกวิศวกรรมซอฟต์แวร์', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d1p1-e1', 'c2', 'EMP-001', 'ภาณุพงศ์ ทรงศิริ', 'staff003@entech.co.th', '081-530-9864', 'employee', null, null, 'วิศวกรซอฟต์แวร์', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d1p1-e2', 'c2', 'EMP-002', 'ศิริลักษณ์ ปัญญาดี', 'staff004@entech.co.th', '081-544-7775', 'employee', null, null, 'วิศวกรซอฟต์แวร์', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d1p2-mgr', 'c2', 'MGR-002', 'ชนิกานต์ วัฒนกุล', 'staff005@entech.co.th', '081-558-5686', 'dept_manager', null, null, 'ผู้จัดการแผนกออกแบบ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d1p2-e3', 'c2', 'EMP-003', 'ธัญญา รักษ์ศิลป์', 'staff006@entech.co.th', '081-572-3597', 'employee', null, null, 'นักออกแบบ UX/UI', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d2-head', 'c2', 'EXE-002', 'เกรียงไกร พิทักษ์ชน', 'staff007@entech.co.th', '081-586-1508', 'division_head', null, null, 'ผู้อำนวยการฝ่ายปฏิบัติการ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d2p1-mgr', 'c2', 'MGR-003', 'พรทิพย์ มณีรัตน์', 'staff008@entech.co.th', '081-599-9419', 'dept_manager', null, null, 'ผู้จัดการแผนกบริการลูกค้า', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d2p1-e4', 'c2', 'EMP-004', 'วิภาวี จันทร์เพ็ญ', 'staff009@entech.co.th', '081-613-7330', 'employee', null, null, 'เจ้าหน้าที่บริการลูกค้า', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d2p1-e5', 'c2', 'EMP-005', 'สมศักดิ์ ตั้งใจมั่น', 'staff010@entech.co.th', '081-627-5241', 'employee', null, null, 'เจ้าหน้าที่บริการลูกค้า', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d2p2-mgr', 'c2', 'MGR-004', 'ธนวัฒน์ กิจเจริญ', 'staff011@entech.co.th', '081-641-3152', 'dept_manager', null, null, 'ผู้จัดการแผนกโครงสร้างพื้นฐาน', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d2p2-e6', 'c2', 'EMP-006', 'ปิยะ ศักดิ์สิทธิ์', 'staff012@entech.co.th', '081-655-1063', 'employee', null, null, 'วิศวกรระบบ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d3-head', 'c2', 'EXE-003', 'สุนิสา อภิรักษ์กุล', 'staff013@entech.co.th', '081-668-8974', 'division_head', null, null, 'ผู้อำนวยการฝ่ายบริหาร', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d3p1-mgr', 'c2', 'MGR-005', 'จารุวรรณ เพ็ชรงาม', 'staff014@entech.co.th', '081-682-6885', 'dept_manager', null, null, 'ผู้จัดการแผนกบุคคลและธุรการ', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d3p1-e7', 'c2', 'EMP-007', 'กมลชนก ดวงแก้ว', 'staff015@entech.co.th', '081-696-4796', 'employee', null, null, 'เจ้าหน้าที่บุคคล', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d3p2-mgr', 'c2', 'MGR-006', 'วศิน ตระกูลทอง', 'staff016@entech.co.th', '081-710-2707', 'dept_manager', null, null, 'ผู้จัดการแผนกบัญชี', null, true, '2026-01-10T00:00:00.000Z'),
  ('u-c2-d3p2-e8', 'c2', 'EMP-008', 'อภิญญา สุขเกษม', 'staff017@entech.co.th', '081-724-0618', 'employee', null, null, 'เจ้าหน้าที่บัญชี', null, true, '2026-01-10T00:00:00.000Z')
on conflict (id) do nothing;

-- divisions
insert into divisions (id, company_id, name, head_user_id) values
  ('d-c1-1', 'c1', 'ฝ่ายผลิต', null),
  ('d-c1-2', 'c1', 'ฝ่ายขายและการตลาด', null),
  ('d-c1-3', 'c1', 'ฝ่ายบริหารและทรัพยากรบุคคล', null),
  ('d-c2-1', 'c2', 'ฝ่ายพัฒนาผลิตภัณฑ์', null),
  ('d-c2-2', 'c2', 'ฝ่ายปฏิบัติการ', null),
  ('d-c2-3', 'c2', 'ฝ่ายบริหาร', null)
on conflict (id) do nothing;

-- departments
insert into departments (id, company_id, division_id, name, head_user_id) values
  ('dep-c1-1-1', 'c1', 'd-c1-1', 'แผนกผลิต', null),
  ('dep-c1-1-2', 'c1', 'd-c1-1', 'แผนกควบคุมคุณภาพ', null),
  ('dep-c1-2-1', 'c1', 'd-c1-2', 'แผนกขาย', null),
  ('dep-c1-2-2', 'c1', 'd-c1-2', 'แผนกการตลาด', null),
  ('dep-c1-3-1', 'c1', 'd-c1-3', 'แผนกบุคคล', null),
  ('dep-c1-3-2', 'c1', 'd-c1-3', 'แผนกบัญชีและการเงิน', null),
  ('dep-c2-1-1', 'c2', 'd-c2-1', 'แผนกวิศวกรรมซอฟต์แวร์', null),
  ('dep-c2-1-2', 'c2', 'd-c2-1', 'แผนกออกแบบประสบการณ์ผู้ใช้', null),
  ('dep-c2-2-1', 'c2', 'd-c2-2', 'แผนกบริการลูกค้า', null),
  ('dep-c2-2-2', 'c2', 'd-c2-2', 'แผนกโครงสร้างพื้นฐาน', null),
  ('dep-c2-3-1', 'c2', 'd-c2-3', 'แผนกบุคคลและธุรการ', null),
  ('dep-c2-3-2', 'c2', 'd-c2-3', 'แผนกบัญชี', null)
on conflict (id) do nothing;

-- อัปเดตความสัมพันธ์ที่ต้องรอให้ตารางที่อ้างอิงมีข้อมูลครบก่อน
update divisions set head_user_id = v.head_user_id from (values
  ('d-c1-1', 'u-c1-d1-head'),
  ('d-c1-2', 'u-c1-d2-head'),
  ('d-c1-3', 'u-c1-d3-head'),
  ('d-c2-1', 'u-c2-d1-head'),
  ('d-c2-2', 'u-c2-d2-head'),
  ('d-c2-3', 'u-c2-d3-head')
) as v(id, head_user_id) where divisions.id = v.id;

update departments set head_user_id = v.head_user_id from (values
  ('dep-c1-1-1', 'u-c1-d1p1-mgr'),
  ('dep-c1-1-2', 'u-c1-d1p2-mgr'),
  ('dep-c1-2-1', 'u-c1-d2p1-mgr'),
  ('dep-c1-2-2', 'u-c1-d2p2-mgr'),
  ('dep-c1-3-1', 'u-c1-d3p1-mgr'),
  ('dep-c1-3-2', 'u-c1-d3p2-mgr'),
  ('dep-c2-1-1', 'u-c2-d1p1-mgr'),
  ('dep-c2-1-2', 'u-c2-d1p2-mgr'),
  ('dep-c2-2-1', 'u-c2-d2p1-mgr'),
  ('dep-c2-2-2', 'u-c2-d2p2-mgr'),
  ('dep-c2-3-1', 'u-c2-d3p1-mgr'),
  ('dep-c2-3-2', 'u-c2-d3p2-mgr')
) as v(id, head_user_id) where departments.id = v.id;

update users set division_id = v.division_id from (values
  ('u-c1-d1-head', 'd-c1-1'),
  ('u-c1-d1p1-mgr', 'd-c1-1'),
  ('u-c1-d1p1-e1', 'd-c1-1'),
  ('u-c1-d1p1-e2', 'd-c1-1'),
  ('u-c1-d1p2-mgr', 'd-c1-1'),
  ('u-c1-d1p2-e3', 'd-c1-1'),
  ('u-c1-d2-head', 'd-c1-2'),
  ('u-c1-d2p1-mgr', 'd-c1-2'),
  ('u-c1-d2p1-e4', 'd-c1-2'),
  ('u-c1-d2p1-e5', 'd-c1-2'),
  ('u-c1-d2p2-mgr', 'd-c1-2'),
  ('u-c1-d2p2-e6', 'd-c1-2'),
  ('u-c1-d3-head', 'd-c1-3'),
  ('u-c1-d3p1-mgr', 'd-c1-3'),
  ('u-c1-d3p1-e7', 'd-c1-3'),
  ('u-c1-d3p2-mgr', 'd-c1-3'),
  ('u-c1-d3p2-e8', 'd-c1-3'),
  ('u-c2-d1-head', 'd-c2-1'),
  ('u-c2-d1p1-mgr', 'd-c2-1'),
  ('u-c2-d1p1-e1', 'd-c2-1'),
  ('u-c2-d1p1-e2', 'd-c2-1'),
  ('u-c2-d1p2-mgr', 'd-c2-1'),
  ('u-c2-d1p2-e3', 'd-c2-1'),
  ('u-c2-d2-head', 'd-c2-2'),
  ('u-c2-d2p1-mgr', 'd-c2-2'),
  ('u-c2-d2p1-e4', 'd-c2-2'),
  ('u-c2-d2p1-e5', 'd-c2-2'),
  ('u-c2-d2p2-mgr', 'd-c2-2'),
  ('u-c2-d2p2-e6', 'd-c2-2'),
  ('u-c2-d3-head', 'd-c2-3'),
  ('u-c2-d3p1-mgr', 'd-c2-3'),
  ('u-c2-d3p1-e7', 'd-c2-3'),
  ('u-c2-d3p2-mgr', 'd-c2-3'),
  ('u-c2-d3p2-e8', 'd-c2-3')
) as v(id, division_id) where users.id = v.id;

update users set department_id = v.department_id from (values
  ('u-c1-d1p1-mgr', 'dep-c1-1-1'),
  ('u-c1-d1p1-e1', 'dep-c1-1-1'),
  ('u-c1-d1p1-e2', 'dep-c1-1-1'),
  ('u-c1-d1p2-mgr', 'dep-c1-1-2'),
  ('u-c1-d1p2-e3', 'dep-c1-1-2'),
  ('u-c1-d2p1-mgr', 'dep-c1-2-1'),
  ('u-c1-d2p1-e4', 'dep-c1-2-1'),
  ('u-c1-d2p1-e5', 'dep-c1-2-1'),
  ('u-c1-d2p2-mgr', 'dep-c1-2-2'),
  ('u-c1-d2p2-e6', 'dep-c1-2-2'),
  ('u-c1-d3p1-mgr', 'dep-c1-3-1'),
  ('u-c1-d3p1-e7', 'dep-c1-3-1'),
  ('u-c1-d3p2-mgr', 'dep-c1-3-2'),
  ('u-c1-d3p2-e8', 'dep-c1-3-2'),
  ('u-c2-d1p1-mgr', 'dep-c2-1-1'),
  ('u-c2-d1p1-e1', 'dep-c2-1-1'),
  ('u-c2-d1p1-e2', 'dep-c2-1-1'),
  ('u-c2-d1p2-mgr', 'dep-c2-1-2'),
  ('u-c2-d1p2-e3', 'dep-c2-1-2'),
  ('u-c2-d2p1-mgr', 'dep-c2-2-1'),
  ('u-c2-d2p1-e4', 'dep-c2-2-1'),
  ('u-c2-d2p1-e5', 'dep-c2-2-1'),
  ('u-c2-d2p2-mgr', 'dep-c2-2-2'),
  ('u-c2-d2p2-e6', 'dep-c2-2-2'),
  ('u-c2-d3p1-mgr', 'dep-c2-3-1'),
  ('u-c2-d3p1-e7', 'dep-c2-3-1'),
  ('u-c2-d3p2-mgr', 'dep-c2-3-2'),
  ('u-c2-d3p2-e8', 'dep-c2-3-2')
) as v(id, department_id) where users.id = v.id;

update users set manager_id = v.manager_id from (values
  ('u-c1-hr', 'u-c1-ceo'),
  ('u-c1-d1-head', 'u-c1-ceo'),
  ('u-c1-d1p1-mgr', 'u-c1-d1-head'),
  ('u-c1-d1p1-e1', 'u-c1-d1p1-mgr'),
  ('u-c1-d1p1-e2', 'u-c1-d1p1-mgr'),
  ('u-c1-d1p2-mgr', 'u-c1-d1-head'),
  ('u-c1-d1p2-e3', 'u-c1-d1p2-mgr'),
  ('u-c1-d2-head', 'u-c1-ceo'),
  ('u-c1-d2p1-mgr', 'u-c1-d2-head'),
  ('u-c1-d2p1-e4', 'u-c1-d2p1-mgr'),
  ('u-c1-d2p1-e5', 'u-c1-d2p1-mgr'),
  ('u-c1-d2p2-mgr', 'u-c1-d2-head'),
  ('u-c1-d2p2-e6', 'u-c1-d2p2-mgr'),
  ('u-c1-d3-head', 'u-c1-ceo'),
  ('u-c1-d3p1-mgr', 'u-c1-d3-head'),
  ('u-c1-d3p1-e7', 'u-c1-d3p1-mgr'),
  ('u-c1-d3p2-mgr', 'u-c1-d3-head'),
  ('u-c1-d3p2-e8', 'u-c1-d3p2-mgr'),
  ('u-c2-hr', 'u-c2-ceo'),
  ('u-c2-d1-head', 'u-c2-ceo'),
  ('u-c2-d1p1-mgr', 'u-c2-d1-head'),
  ('u-c2-d1p1-e1', 'u-c2-d1p1-mgr'),
  ('u-c2-d1p1-e2', 'u-c2-d1p1-mgr'),
  ('u-c2-d1p2-mgr', 'u-c2-d1-head'),
  ('u-c2-d1p2-e3', 'u-c2-d1p2-mgr'),
  ('u-c2-d2-head', 'u-c2-ceo'),
  ('u-c2-d2p1-mgr', 'u-c2-d2-head'),
  ('u-c2-d2p1-e4', 'u-c2-d2p1-mgr'),
  ('u-c2-d2p1-e5', 'u-c2-d2p1-mgr'),
  ('u-c2-d2p2-mgr', 'u-c2-d2-head'),
  ('u-c2-d2p2-e6', 'u-c2-d2p2-mgr'),
  ('u-c2-d3-head', 'u-c2-ceo'),
  ('u-c2-d3p1-mgr', 'u-c2-d3-head'),
  ('u-c2-d3p1-e7', 'u-c2-d3p1-mgr'),
  ('u-c2-d3p2-mgr', 'u-c2-d3-head'),
  ('u-c2-d3p2-e8', 'u-c2-d3p2-mgr')
) as v(id, manager_id) where users.id = v.id;

-- cycles
insert into cycles (id, company_id, name, year, active, created_at) values
  ('cy-c1-1', 'c1', 'รอบที่ 1/2568 (ม.ค.–มิ.ย.)', 2568, true, '2026-01-10T00:00:00.000Z'),
  ('cy-c1-0', 'c1', 'รอบที่ 2/2567 (ก.ค.–ธ.ค.)', 2567, false, '2025-07-01T00:00:00.000Z'),
  ('cy-c2-1', 'c2', 'รอบที่ 1/2568 (ม.ค.–มิ.ย.)', 2568, true, '2026-01-10T00:00:00.000Z'),
  ('cy-c2-0', 'c2', 'รอบที่ 2/2567 (ก.ค.–ธ.ค.)', 2567, false, '2025-07-01T00:00:00.000Z')
on conflict (id) do nothing;

-- kpis
insert into kpis (id, company_id, level, title, division_id, department_id, parent_kpi_id, created_by_id, created_at) values
  ('k-c1-1', 'c1', 'org', 'เพิ่มยอดขายรวมขององค์กร 20% ภายในปี 2568', null, null, null, 'u-c1-hr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-2', 'c1', 'org', 'ยกระดับความพึงพอใจของลูกค้า ≥ 90%', null, null, null, 'u-c1-hr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-3', 'c1', 'org', 'ลดของเสียในกระบวนการผลิต 15%', null, null, null, 'u-c1-hr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-4', 'c1', 'division', 'เพิ่มกำลังการผลิต 18%', 'd-c1-1', null, 'k-c1-1', 'u-c1-d1-head', '2026-01-10T00:00:00.000Z'),
  ('k-c1-5', 'c1', 'division', 'ลดต้นทุนการผลิตต่อหน่วย 12%', 'd-c1-1', null, 'k-c1-1', 'u-c1-d1-head', '2026-01-10T00:00:00.000Z'),
  ('k-c1-6', 'c1', 'department', 'ผลิตสินค้าได้ตามแผน 100%', 'd-c1-1', 'dep-c1-1-1', 'k-c1-4', 'u-c1-d1p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-7', 'c1', 'department', 'ลดเวลาหยุดเครื่องจักร 20%', 'd-c1-1', 'dep-c1-1-1', 'k-c1-4', 'u-c1-d1p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-8', 'c1', 'department', 'สินค้าผ่านมาตรฐาน QC ≥ 99%', 'd-c1-1', 'dep-c1-1-2', 'k-c1-4', 'u-c1-d1p2-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-9', 'c1', 'division', 'ขยายฐานลูกค้าใหม่ 25%', 'd-c1-2', null, 'k-c1-1', 'u-c1-d2-head', '2026-01-10T00:00:00.000Z'),
  ('k-c1-10', 'c1', 'division', 'เพิ่มการรับรู้แบรนด์ในกลุ่มเป้าหมาย', 'd-c1-2', null, 'k-c1-1', 'u-c1-d2-head', '2026-01-10T00:00:00.000Z'),
  ('k-c1-11', 'c1', 'department', 'ทำยอดขายได้ตามเป้า 100%', 'd-c1-2', 'dep-c1-2-1', 'k-c1-9', 'u-c1-d2p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-12', 'c1', 'department', 'จัดแคมเปญการตลาด 6 แคมเปญต่อปี', 'd-c1-2', 'dep-c1-2-2', 'k-c1-9', 'u-c1-d2p2-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-13', 'c1', 'division', 'บริหารต้นทุนสำนักงานตามงบประมาณ', 'd-c1-3', null, 'k-c1-1', 'u-c1-d3-head', '2026-01-10T00:00:00.000Z'),
  ('k-c1-14', 'c1', 'department', 'สรรหาพนักงานครบตามอัตรากำลัง 100%', 'd-c1-3', 'dep-c1-3-1', 'k-c1-13', 'u-c1-d3p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c1-15', 'c1', 'department', 'ปิดงบการเงินตรงเวลาทุกเดือน', 'd-c1-3', 'dep-c1-3-2', 'k-c1-13', 'u-c1-d3p2-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-1', 'c2', 'org', 'เพิ่มรายได้จากบริการคลาวด์ 30%', null, null, null, 'u-c2-hr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-2', 'c2', 'org', 'รักษาอัตราคงอยู่ของลูกค้า ≥ 95%', null, null, null, 'u-c2-hr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-3', 'c2', 'org', 'ส่งมอบโปรเจกต์ตรงเวลา ≥ 90%', null, null, null, 'u-c2-hr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-4', 'c2', 'division', 'ออกฟีเจอร์ใหม่ตาม roadmap', 'd-c2-1', null, 'k-c2-1', 'u-c2-d1-head', '2026-01-10T00:00:00.000Z'),
  ('k-c2-5', 'c2', 'division', 'ลดบั๊กบนระบบ production 40%', 'd-c2-1', null, 'k-c2-1', 'u-c2-d1-head', '2026-01-10T00:00:00.000Z'),
  ('k-c2-6', 'c2', 'department', 'ส่งมอบงานตามแผน sprint ≥ 90%', 'd-c2-1', 'dep-c2-1-1', 'k-c2-4', 'u-c2-d1p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-7', 'c2', 'department', 'ปรับปรุง UX จากผลตอบรับผู้ใช้', 'd-c2-1', 'dep-c2-1-2', 'k-c2-4', 'u-c2-d1p2-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-8', 'c2', 'division', 'รักษาเสถียรภาพระบบ uptime ≥ 99.9%', 'd-c2-2', null, 'k-c2-1', 'u-c2-d2-head', '2026-01-10T00:00:00.000Z'),
  ('k-c2-9', 'c2', 'department', 'ตอบ ticket ภายใน SLA ≥ 95%', 'd-c2-2', 'dep-c2-2-1', 'k-c2-8', 'u-c2-d2p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-10', 'c2', 'department', 'ดูแลระบบคลาวด์ให้พร้อมใช้งาน', 'd-c2-2', 'dep-c2-2-2', 'k-c2-8', 'u-c2-d2p2-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-11', 'c2', 'division', 'บริหารงบประมาณองค์กรอย่างมีประสิทธิภาพ', 'd-c2-3', null, 'k-c2-1', 'u-c2-d3-head', '2026-01-10T00:00:00.000Z'),
  ('k-c2-12', 'c2', 'department', 'พัฒนาทักษะพนักงานครบ 100%', 'd-c2-3', 'dep-c2-3-1', 'k-c2-11', 'u-c2-d3p1-mgr', '2026-01-10T00:00:00.000Z'),
  ('k-c2-13', 'c2', 'department', 'จัดทำรายงานการเงินถูกต้องตรงเวลา', 'd-c2-3', 'dep-c2-3-2', 'k-c2-11', 'u-c2-d3p2-mgr', '2026-01-10T00:00:00.000Z')
on conflict (id) do nothing;

-- assessments
insert into assessments (id, company_id, cycle_id, user_id, evaluator_id, remark, status, self_total, final_score, submitted_at, evaluated_at, created_at, updated_at) values
  ('as-u-c1-d1-head', 'c1', 'cy-c1-1', 'u-c1-d1-head', 'u-c1-ceo', null, 'evaluated', 94, 91, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d1p1-mgr', 'c1', 'cy-c1-1', 'u-c1-d1p1-mgr', 'u-c1-d1-head', null, 'evaluated', 90, 87, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d1p1-e1', 'c1', 'cy-c1-1', 'u-c1-d1p1-e1', 'u-c1-d1p1-mgr', 'ฉบับร่าง — ยังไม่ได้ส่ง KPI ให้ผู้บังคับบัญชา', 'submitted', 83, null, '2026-06-23T07:22:09.474Z', null, '2026-01-10T00:00:00.000Z', '2026-06-23T07:22:09.474Z'),
  ('as-u-c1-d1p1-e2', 'c1', 'cy-c1-1', 'u-c1-d1p1-e2', 'u-c1-d1p1-mgr', null, 'evaluated', 81, 78, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d1p2-mgr', 'c1', 'cy-c1-1', 'u-c1-d1p2-mgr', 'u-c1-d1-head', null, 'evaluated', 87, 84, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d1p2-e3', 'c1', 'cy-c1-1', 'u-c1-d1p2-e3', 'u-c1-d1p2-mgr', null, 'evaluated', 91, 88, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d2-head', 'c1', 'cy-c1-1', 'u-c1-d2-head', 'u-c1-ceo', null, 'evaluated', 89, 86, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d2p1-mgr', 'c1', 'cy-c1-1', 'u-c1-d2p1-mgr', 'u-c1-d2-head', null, 'evaluated', 86, 83, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d2p1-e4', 'c1', 'cy-c1-1', 'u-c1-d2p1-e4', 'u-c1-d2p1-mgr', null, 'evaluated', 95, 92, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d2p1-e5', 'c1', 'cy-c1-1', 'u-c1-d2p1-e5', 'u-c1-d2p1-mgr', null, 'evaluated', 76, 73, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d2p2-mgr', 'c1', 'cy-c1-1', 'u-c1-d2p2-mgr', 'u-c1-d2-head', null, 'evaluated', 83, 80, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d2p2-e6', 'c1', 'cy-c1-1', 'u-c1-d2p2-e6', 'u-c1-d2p2-mgr', null, 'evaluated', 85, 82, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d3-head', 'c1', 'cy-c1-1', 'u-c1-d3-head', 'u-c1-ceo', null, 'evaluated', 82, 79, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d3p1-mgr', 'c1', 'cy-c1-1', 'u-c1-d3p1-mgr', 'u-c1-d3-head', null, 'evaluated', 84, 81, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d3p1-e7', 'c1', 'cy-c1-1', 'u-c1-d3p1-e7', 'u-c1-d3p1-mgr', null, 'evaluated', 83, 80, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d3p2-mgr', 'c1', 'cy-c1-1', 'u-c1-d3p2-mgr', 'u-c1-d3-head', null, 'evaluated', 80, 77, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c1-d3p2-e8', 'c1', 'cy-c1-1', 'u-c1-d3p2-e8', 'u-c1-d3p2-mgr', null, 'evaluated', 79, 76, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d1-head', 'c2', 'cy-c2-1', 'u-c2-d1-head', 'u-c2-ceo', null, 'evaluated', 93, 90, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d1p1-mgr', 'c2', 'cy-c2-1', 'u-c2-d1p1-mgr', 'u-c2-d1-head', null, 'evaluated', 91, 88, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d1p1-e1', 'c2', 'cy-c2-1', 'u-c2-d1p1-e1', 'u-c2-d1p1-mgr', null, 'evaluated', 92, 89, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d1p1-e2', 'c2', 'cy-c2-1', 'u-c2-d1p1-e2', 'u-c2-d1p1-mgr', null, 'evaluated', 87, 84, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d1p2-mgr', 'c2', 'cy-c2-1', 'u-c2-d1p2-mgr', 'u-c2-d1-head', null, 'evaluated', 85, 82, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d1p2-e3', 'c2', 'cy-c2-1', 'u-c2-d1p2-e3', 'u-c2-d1p2-mgr', null, 'evaluated', 84, 81, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d2-head', 'c2', 'cy-c2-1', 'u-c2-d2-head', 'u-c2-ceo', null, 'evaluated', 88, 85, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d2p1-mgr', 'c2', 'cy-c2-1', 'u-c2-d2p1-mgr', 'u-c2-d2-head', null, 'evaluated', 82, 79, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d2p1-e4', 'c2', 'cy-c2-1', 'u-c2-d2p1-e4', 'u-c2-d2p1-mgr', null, 'evaluated', 80, 77, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d2p1-e5', 'c2', 'cy-c2-1', 'u-c2-d2p1-e5', 'u-c2-d2p1-mgr', null, 'evaluated', 73, 70, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d2p2-mgr', 'c2', 'cy-c2-1', 'u-c2-d2p2-mgr', 'u-c2-d2-head', null, 'evaluated', 90, 87, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d2p2-e6', 'c2', 'cy-c2-1', 'u-c2-d2p2-e6', 'u-c2-d2p2-mgr', null, 'evaluated', 89, 86, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d3-head', 'c2', 'cy-c2-1', 'u-c2-d3-head', 'u-c2-ceo', null, 'evaluated', 83, 80, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d3p1-mgr', 'c2', 'cy-c2-1', 'u-c2-d3p1-mgr', 'u-c2-d3-head', null, 'evaluated', 85, 82, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d3p1-e7', 'c2', 'cy-c2-1', 'u-c2-d3p1-e7', 'u-c2-d3p1-mgr', null, 'evaluated', 86, 83, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d3p2-mgr', 'c2', 'cy-c2-1', 'u-c2-d3p2-mgr', 'u-c2-d3-head', null, 'evaluated', 81, 78, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
  ('as-u-c2-d3p2-e8', 'c2', 'cy-c2-1', 'u-c2-d3p2-e8', 'u-c2-d3p2-mgr', null, 'evaluated', 82, 79, '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z')
on conflict (id) do nothing;

-- assessment_items
insert into assessment_items (assessment_id, item_id, position, title, weight, target, linked_kpi_id, self_score, self_comment, eval_score, eval_comment) values
  ('as-u-c1-d1-head', 'as-u-c1-d1-head-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-1', 95, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 91, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d1-head', 'as-u-c1-d1-head-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-1', 93, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 91, 'ทำได้ดี'),
  ('as-u-c1-d1p1-mgr', 'as-u-c1-d1p1-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-4', 91, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 87, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d1p1-mgr', 'as-u-c1-d1p1-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-4', 89, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 87, 'ทำได้ดี'),
  ('as-u-c1-d1p1-e1', 'as-u-c1-d1p1-e1-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'จำนวนงานที่ทำได้ตามแผน', 'k-c1-6', 85, 'อยู่ระหว่างกรอกผลงาน ยังไม่ได้ส่งให้ผู้บังคับบัญชา', null, ''),
  ('as-u-c1-d1p1-e1', 'as-u-c1-d1p1-e1-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'จำนวนกิจกรรมพัฒนาทักษะ', 'k-c1-6', 80, '', null, ''),
  ('as-u-c1-d1p1-e2', 'as-u-c1-d1p1-e2-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-6', 82, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 78, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d1p1-e2', 'as-u-c1-d1p1-e2-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-6', 80, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 78, 'ทำได้ดี'),
  ('as-u-c1-d1p2-mgr', 'as-u-c1-d1p2-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-4', 88, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 84, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d1p2-mgr', 'as-u-c1-d1p2-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-4', 86, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 84, 'ทำได้ดี'),
  ('as-u-c1-d1p2-e3', 'as-u-c1-d1p2-e3-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-8', 92, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 88, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d1p2-e3', 'as-u-c1-d1p2-e3-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-8', 90, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 88, 'ทำได้ดี'),
  ('as-u-c1-d2-head', 'as-u-c1-d2-head-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-1', 90, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 86, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d2-head', 'as-u-c1-d2-head-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-1', 88, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 86, 'ทำได้ดี'),
  ('as-u-c1-d2p1-mgr', 'as-u-c1-d2p1-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-9', 87, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 83, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d2p1-mgr', 'as-u-c1-d2p1-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-9', 85, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 83, 'ทำได้ดี'),
  ('as-u-c1-d2p1-e4', 'as-u-c1-d2p1-e4-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-11', 96, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 92, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d2p1-e4', 'as-u-c1-d2p1-e4-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-11', 94, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 92, 'ทำได้ดี'),
  ('as-u-c1-d2p1-e5', 'as-u-c1-d2p1-e5-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-11', 77, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 73, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d2p1-e5', 'as-u-c1-d2p1-e5-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-11', 75, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 73, 'ทำได้ดี'),
  ('as-u-c1-d2p2-mgr', 'as-u-c1-d2p2-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-9', 84, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 80, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d2p2-mgr', 'as-u-c1-d2p2-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-9', 82, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 80, 'ทำได้ดี'),
  ('as-u-c1-d2p2-e6', 'as-u-c1-d2p2-e6-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-12', 86, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 82, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d2p2-e6', 'as-u-c1-d2p2-e6-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-12', 84, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 82, 'ทำได้ดี'),
  ('as-u-c1-d3-head', 'as-u-c1-d3-head-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-1', 83, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 79, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d3-head', 'as-u-c1-d3-head-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-1', 81, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 79, 'ทำได้ดี'),
  ('as-u-c1-d3p1-mgr', 'as-u-c1-d3p1-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-13', 85, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 81, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d3p1-mgr', 'as-u-c1-d3p1-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-13', 83, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 81, 'ทำได้ดี'),
  ('as-u-c1-d3p1-e7', 'as-u-c1-d3p1-e7-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-14', 84, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 80, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d3p1-e7', 'as-u-c1-d3p1-e7-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-14', 82, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 80, 'ทำได้ดี'),
  ('as-u-c1-d3p2-mgr', 'as-u-c1-d3p2-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-13', 81, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 77, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d3p2-mgr', 'as-u-c1-d3p2-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-13', 79, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 77, 'ทำได้ดี'),
  ('as-u-c1-d3p2-e8', 'as-u-c1-d3p2-e8-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c1-15', 80, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 76, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c1-d3p2-e8', 'as-u-c1-d3p2-e8-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c1-15', 78, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 76, 'ทำได้ดี'),
  ('as-u-c2-d1-head', 'as-u-c2-d1-head-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-1', 94, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 90, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d1-head', 'as-u-c2-d1-head-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-1', 92, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 90, 'ทำได้ดี'),
  ('as-u-c2-d1p1-mgr', 'as-u-c2-d1p1-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-4', 92, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 88, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d1p1-mgr', 'as-u-c2-d1p1-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-4', 90, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 88, 'ทำได้ดี'),
  ('as-u-c2-d1p1-e1', 'as-u-c2-d1p1-e1-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-6', 93, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 89, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d1p1-e1', 'as-u-c2-d1p1-e1-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-6', 91, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 89, 'ทำได้ดี'),
  ('as-u-c2-d1p1-e2', 'as-u-c2-d1p1-e2-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-6', 88, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 84, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d1p1-e2', 'as-u-c2-d1p1-e2-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-6', 86, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 84, 'ทำได้ดี'),
  ('as-u-c2-d1p2-mgr', 'as-u-c2-d1p2-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-4', 86, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 82, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d1p2-mgr', 'as-u-c2-d1p2-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-4', 84, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 82, 'ทำได้ดี'),
  ('as-u-c2-d1p2-e3', 'as-u-c2-d1p2-e3-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-7', 85, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 81, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d1p2-e3', 'as-u-c2-d1p2-e3-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-7', 83, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 81, 'ทำได้ดี'),
  ('as-u-c2-d2-head', 'as-u-c2-d2-head-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-1', 89, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 85, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d2-head', 'as-u-c2-d2-head-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-1', 87, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 85, 'ทำได้ดี'),
  ('as-u-c2-d2p1-mgr', 'as-u-c2-d2p1-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-8', 83, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 79, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d2p1-mgr', 'as-u-c2-d2p1-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-8', 81, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 79, 'ทำได้ดี'),
  ('as-u-c2-d2p1-e4', 'as-u-c2-d2p1-e4-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-9', 81, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 77, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d2p1-e4', 'as-u-c2-d2p1-e4-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-9', 79, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 77, 'ทำได้ดี'),
  ('as-u-c2-d2p1-e5', 'as-u-c2-d2p1-e5-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-9', 74, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 70, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d2p1-e5', 'as-u-c2-d2p1-e5-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-9', 72, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 70, 'ทำได้ดี'),
  ('as-u-c2-d2p2-mgr', 'as-u-c2-d2p2-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-8', 91, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 87, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d2p2-mgr', 'as-u-c2-d2p2-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-8', 89, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 87, 'ทำได้ดี'),
  ('as-u-c2-d2p2-e6', 'as-u-c2-d2p2-e6-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-10', 90, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 86, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d2p2-e6', 'as-u-c2-d2p2-e6-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-10', 88, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 86, 'ทำได้ดี'),
  ('as-u-c2-d3-head', 'as-u-c2-d3-head-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-1', 84, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 80, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d3-head', 'as-u-c2-d3-head-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-1', 82, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 80, 'ทำได้ดี'),
  ('as-u-c2-d3p1-mgr', 'as-u-c2-d3p1-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-11', 86, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 82, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d3p1-mgr', 'as-u-c2-d3p1-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-11', 84, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 82, 'ทำได้ดี'),
  ('as-u-c2-d3p1-e7', 'as-u-c2-d3p1-e7-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-12', 87, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 83, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d3p1-e7', 'as-u-c2-d3p1-e7-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-12', 85, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 83, 'ทำได้ดี'),
  ('as-u-c2-d3p2-mgr', 'as-u-c2-d3p2-mgr-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-11', 82, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 78, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d3p2-mgr', 'as-u-c2-d3p2-mgr-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-11', 80, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 78, 'ทำได้ดี'),
  ('as-u-c2-d3p2-e8', 'as-u-c2-d3p2-e8-i1', 0, 'เป้าหมายหลักตามบทบาท', 60, 'ภายในรอบประเมิน (ม.ค.–มิ.ย. 2568)', 'k-c2-13', 83, 'ทำงานเต็มที่ตามเป้าหมายที่วางไว้', 79, 'ผลงานเป็นไปตามเป้าหมาย'),
  ('as-u-c2-d3p2-e8', 'as-u-c2-d3p2-e8-i2', 1, 'การพัฒนาและความร่วมมือในทีม', 40, 'ต่อเนื่องตลอดรอบ', 'k-c2-13', 81, 'พัฒนาตนเองและช่วยงานทีมอย่างต่อเนื่อง', 79, 'ทำได้ดี')
on conflict (assessment_id, item_id) do nothing;

-- announcements (ไม่มีข้อมูลตัวอย่างเริ่มต้น)

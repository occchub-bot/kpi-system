# KPI System

ระบบประเมิน KPI องค์กรหลาย role — UI มินิมอล ขาวดำ (Next.js 16 + App Router + Tailwind v4)

## รัน

```bash
npm install
cp .env.local.example .env.local   # แล้วใส่ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ดูหัวข้อด้านล่าง)
npm run dev      # เปิด http://localhost:3000  (โปรเจกต์นี้ทดสอบบนพอร์ต 3002: PORT=3002 npm run dev)
```

## การเก็บข้อมูล (Supabase / Postgres)

ข้อมูลทั้งหมดเก็บใน Supabase (Postgres) ผ่านตารางแบบ relational (companies, divisions,
departments, users, cycles, kpis, assessments, assessment_items, announcements)

**ตั้งค่าครั้งแรก:**
1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com)
2. ไปที่ **SQL Editor** ในโปรเจกต์ แล้ววางไฟล์ `supabase/setup.sql` ทั้งไฟล์ กด Run
   ครั้งเดียว — สคริปต์นี้สร้างตาราง/index/RLS ทั้งหมด และ seed ข้อมูลตัวอย่าง 2 บริษัท
   ให้ครบ (ถ้าต้องการแค่ schema เปล่าไม่มี seed ให้รัน `supabase/schema.sql` แทน)
3. ไปที่ **Project Settings > API** คัดลอก **Project URL** และ **service_role key**
4. คัดลอก `.env.local.example` เป็น `.env.local` แล้วใส่ค่าทั้งสอง
5. `npm run dev` — แอปจะอ่าน/เขียนข้อมูลผ่าน Supabase ทันที

รันสคริปต์ `supabase/setup.sql` ซ้ำได้อย่างปลอดภัย (ใช้ `if not exists`/`on conflict do nothing`)
ถ้าต้องการรีเซ็ตข้อมูลกลับเป็นค่าเริ่มต้น ให้ลบตารางทั้งหมดแล้วรัน `setup.sql` ใหม่

## เข้าสู่ระบบ (passwordless)

พิมพ์อีเมลในหน้า `/login` หรือคลิกบัญชีตัวอย่าง — บัญชีในข้อมูลตัวอย่าง:

| บทบาท | ชื่อ | อีเมล |
|---|---|---|
| ผู้ดูแลระบบ (admin) | ผู้ดูแลระบบ | `admin@kpi.system` |
| HR | คุณพิมพ์ | `hr@example.com` |
| CEO | คุณวิชัย | `ceo@example.com` |
| ผู้บริหารฝ่าย | คุณสมชาย | `somchai@example.com` |
| ผจก.แผนก HR | คุณสุดา | `suda@example.com` |
| ผจก.แผนกการเงิน | คุณมานพ | `manop@example.com` |
| พนักงาน | คุณอนันต์ | `anan@example.com` |

## โครงสร้าง role & เมนู

- **admin** — เห็นทุกบริษัท (จำนวนคน/ฝ่าย/แผนก/KPI เฉลี่ย), เพิ่มบริษัท + อีเมล HR
- **HR** — Dashboard องค์กร + การจัดการ (ฝ่าย → แผนก → พนักงาน, รอบประเมิน, KPI องค์กร) + ส่วนบุคคล
- **CEO** — เหมือน HR + ประเมินลูกน้อง (ผู้บริหารฝ่าย)
- **ผู้บริหารฝ่าย** — Dashboard ฝ่าย (AVG ฝ่าย/ทุกแผนก, Bell curve) + การจัดการ (KPI ฝ่าย, ประเมินลูกน้อง) + ส่วนบุคคล
- **ผจก.แผนก** — Dashboard แผนก (พนักงานในแผนก + Final Score) + การจัดการ (KPI แผนก, ประเมินลูกน้อง) + ส่วนบุคคล
- **พนักงาน** — ส่วนบุคคลอย่างเดียว (ประเมินตนเอง ส่งให้หัวหน้า)

## Flow การประเมิน

1. นิยาม KPI แบบ "หัวข้ออย่างเดียว" (ไม่มี weight/time): องค์กร (HR) → ฝ่าย (ผู้บริหารฝ่าย) → แผนก (ผจก.)
2. ทุกคนทำ **ประเมินตนเอง** ที่ `KPI ของฉัน` — ใส่ weight, กรอบเวลา, คะแนนตนเอง และ **เชื่อม KPI** ขึ้นระดับบนเป็นทอด ๆ
   (พนักงาน→KPI แผนก, ผจก.→KPI ฝ่าย, ผู้บริหารฝ่าย→KPI องค์กร)
3. กด "ส่งให้หัวหน้าประเมิน" → หัวหน้าเห็นที่ `ประเมินลูกน้อง` แล้วให้คะแนนกลับ
4. **Final Score** = คะแนนหัวหน้าถ่วงน้ำหนักตาม weight → แสดงใน Dashboard (AVG รายแผนก/ฝ่าย/องค์กร + Bell curve)

## สถาปัตยกรรมโค้ด

- `lib/types.ts` — โมเดลข้อมูล
- `lib/supabase.ts` — Supabase client (service_role, server เท่านั้น)
- `lib/mappers.ts` — แปลง row Supabase (snake_case) ↔ entity ของแอป (camelCase)
- `lib/store.ts` — `readDB()` โหลดข้อมูลทั้งก้อนจาก Supabase มาประกอบเป็นรูปทรง `DB` เดียว
  ต่อ 1 request (หน้าเรียกครั้งเดียวแล้วส่ง `db` ต่อให้ `lib/queries.ts`)
- `lib/auth.ts` — session ผ่าน cookie + query user จาก Supabase
- `lib/queries.ts` — selectors + การคำนวณคะแนน/AVG/bell curve (pure function รับ `db: DB` เป็นอาร์กิวเมนต์แรก)
- `lib/actions.ts` — server actions (insert/update/delete ตรงไปที่ตาราง Supabase)
- `lib/nav.ts` — เมนูตาม role
- `supabase/schema.sql` — ตาราง/enum/index/RLS
- `supabase/seed.sql` — ข้อมูลตัวอย่าง (generate มาจาก data ชุดเดิม)
- `supabase/setup.sql` — schema.sql + seed.sql รวมไฟล์เดียว สำหรับรันครั้งเดียวใน SQL Editor
- `app/(app)/...` — หน้าใช้งานหลัง login
- `components/` — UI ขาวดำ + ฟอร์ม client (ประเมินตนเอง/ประเมินลูกน้อง)

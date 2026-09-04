# KPI System

ระบบประเมิน KPI องค์กรหลาย role — UI มินิมอล ขาวดำ
(Next.js 16 + App Router + Tailwind v4 + Prisma + PostgreSQL, deploy บนเซิร์ฟเวอร์ตัวเอง)

## Deploy บนเซิร์ฟเวอร์

สิ่งที่ต้องมีบนเซิร์ฟเวอร์: **Node** ตามที่ `engines` กำหนด (`^20.19 || ^22.12 || >=24`)
และ **PostgreSQL 14+** (โปรเจกต์นี้ทดสอบบน 17)

### 1. เตรียมฐานข้อมูล

```sql
-- psql -U postgres
CREATE USER kpi WITH PASSWORD 'ใส่รหัสผ่านที่ตั้งเอง';
CREATE DATABASE kpi OWNER kpi;
```

Prisma ต้องเป็นเจ้าของ schema เพื่อสร้าง/แก้ตารางได้ — ให้ `kpi` เป็น OWNER ของ database
ไม่ต้องสร้างตารางเอง `npm run db:migrate` จัดการให้ทั้งหมด

### 2. ติดตั้งและรัน

```bash
git clone <repo> kpi-system && cd kpi-system
cp .env.example .env
nano .env                  # ใส่ DATABASE_URL ให้ตรงกับที่สร้างไว้ข้างบน

npm ci                     # postinstall เรียก prisma generate ให้เอง
npm run db:migrate         # สร้างตารางทั้งหมด
npm run db:seed            # ข้อมูลตัวอย่าง 2 บริษัท (ครั้งแรกเท่านั้น ข้ามได้ถ้าจะเริ่มจากศูนย์)
npm run build
npm start                  # ฟังที่พอร์ต 3000 (เปลี่ยนได้ด้วย PORT ใน .env)
```

### 3. ให้รันค้างเป็น service (systemd)

`/etc/systemd/system/kpi-system.service`

```ini
[Unit]
Description=KPI System
After=network.target postgresql.service

[Service]
Type=simple
User=kpi
WorkingDirectory=/srv/kpi-system
EnvironmentFile=/srv/kpi-system/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kpi-system
sudo journalctl -u kpi-system -f
```

### 4. เปิดให้เข้าจากภายนอกด้วย HTTPS

อย่า publish พอร์ต 3000 ออกเน็ตตรง ๆ ให้วาง reverse proxy คั่นไว้ ตัวอย่าง nginx:

```nginx
server {
    server_name kpi.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

แล้วขอใบรับรองด้วย `sudo certbot --nginx -d kpi.example.com`

### 5. อัปเดตเวอร์ชันใหม่

```bash
cd /srv/kpi-system
git pull
npm ci
npm run db:migrate         # apply migration ใหม่ (ถ้ามี) — ต้องรันก่อน build เสมอ
npm run build
sudo systemctl restart kpi-system
```

### 6. สำรอง / กู้คืนข้อมูล

ต้องมี `pg_dump` ใน PATH (แพ็กเกจ `postgresql-client`)

```bash
npm run db:backup          # ได้ไฟล์ backups/kpi-<เวลา>.sql.gz
gunzip -c backups/kpi-2569-01-01T00-00-00.sql.gz | psql "$DATABASE_URL"
```

ตั้ง cron รายวัน: `0 3 * * * cd /srv/kpi-system && npm run db:backup`

## รันบนเครื่องตัวเอง (dev)

ต้องมี PostgreSQL บนเครื่องเช่นกัน (ติดตั้งเอง หรือชี้ `DATABASE_URL` ไปที่ DB สำหรับ dev ที่ไหนก็ได้)

```bash
npm install
cp .env.example .env       # ใส่ DATABASE_URL
npm run db:migrate
npm run db:seed
npm run dev                # http://localhost:3000
                           # โปรเจกต์นี้ทดสอบบนพอร์ต 3002: PORT=3002 npm run dev
```

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run db:migrate` | apply migration ที่มีอยู่ (ใช้ตอน deploy) |
| `npm run db:migrate:dev` | สร้าง migration ใหม่หลังแก้ `prisma/schema.prisma` |
| `npm run db:seed` | ใส่ข้อมูลตัวอย่าง + ตั้งรหัสผ่านให้ทุกบัญชี (รันซ้ำได้) |
| `npm run db:studio` | เปิด Prisma Studio ดู/แก้ข้อมูลผ่าน UI |
| `npm run db:backup` | สำรองฐานข้อมูลเป็น `.sql.gz` |

## ทดสอบ

```bash
npm run test:agent                                # เช็คสิทธิ์การเข้าถึงทั้ง 7 role (read-only)
npm run test:agent -- --full                      # + รัน flow ประเมินจริงครบวงจร
npm run test:agent -- --full http://127.0.0.1:3000   # ยิงใส่เซิร์ฟเวอร์ production ก็ได้
```

ต้องมีเซิร์ฟเวอร์รันอยู่ก่อน (ค่าเริ่มต้นยิงไปที่พอร์ต 3002) และโหมด `--full` ต้องมี
`DATABASE_URL` เพื่ออ่าน/เก็บกวาดแถวที่ UI ไม่เปิดให้ทำ

สคริปต์ยิง multipart POST เข้า server action จริงแบบ browser ที่ไม่มี JS จึงเป็นการทดสอบ
code path จริง ไม่ใช่ mock — โหมด `--full` สร้างพนักงานชั่วคราวขึ้นมาแล้วลบทิ้งเมื่อจบ

## การเก็บข้อมูล

PostgreSQL ผ่าน Prisma — 9 ตาราง (companies, divisions, departments, users, cycles, kpis,
assessments, assessment_items, announcements)

- `prisma/schema.prisma` — schema ต้นทาง (camelCase + `@map` ลงคอลัมน์ snake_case)
- `prisma/migrations/` — migration history ที่ `db:migrate` ใช้
- `prisma/seed.sql` — ข้อมูลตัวอย่าง 2 บริษัท
- `prisma/seed.mjs` — รัน seed.sql แล้วตั้ง `password_hash` ให้ทุกบัญชี (seed.sql ไม่มีรหัสผ่าน)

## เข้าสู่ระบบ

ทุกบัญชีในข้อมูลตัวอย่างใช้รหัสผ่านเดียวกันตามที่ `npm run db:seed` พิมพ์ออกมา
(ค่าเริ่มต้น `kpi-demo-2569` เปลี่ยนได้ด้วย env `SEED_PASSWORD`)
**เปลี่ยนรหัสผ่านทันทีหลังเข้าระบบครั้งแรก** ที่เมนู "บัญชีของฉัน"

| บทบาท | อีเมล |
|---|---|
| ผู้ดูแลระบบ (admin) | `admin@kpi.system` |
| HR | `hr@siamfoods.co.th` |
| CEO | `ceo@siamfoods.co.th` |
| ผู้บริหารฝ่าย | `staff001@siamfoods.co.th` |
| ผจก.แผนก | `staff002@siamfoods.co.th` |
| พนักงาน | `staff003@siamfoods.co.th` |

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
- `lib/prisma.ts` — Prisma client (singleton + driver adapter, server เท่านั้น)
- `lib/mappers.ts` — แปลง row ของ Prisma (Date/Decimal) → entity ของแอป (string/number)
- `lib/store.ts` — `readDB()` โหลดข้อมูลทั้งก้อนใน `$transaction` เดียวมาประกอบเป็นรูปทรง `DB`
  ต่อ 1 request (หน้าเรียกครั้งเดียวแล้วส่ง `db` ต่อให้ `lib/queries.ts`)
- `lib/auth.ts` — session ผ่าน cookie + query user จาก Postgres
- `lib/queries.ts` — selectors + การคำนวณคะแนน/AVG/bell curve (pure function รับ `db: DB` เป็นอาร์กิวเมนต์แรก)
- `lib/actions.ts` — server actions ทั้งหมด
- `lib/nav.ts` — เมนูตาม role
- `app/(app)/...` — หน้าใช้งานหลัง login
- `components/` — UI ขาวดำ + ฟอร์ม client (ประเมินตนเอง/ประเมินลูกน้อง)

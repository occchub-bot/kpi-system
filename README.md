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
npm start                  # ทดสอบเฉย ๆ ของจริงให้ pm2 คุมในหัวข้อ 3 (พอร์ต 3777)
```

### 3. ให้รันค้างด้วย pm2

แอปฟังที่ **พอร์ต 3777** (กำหนดใน `ecosystem.config.js` ที่อยู่ใน repo)

```bash
sudo npm i -g pm2
cd /srv/kpi-system
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
pm2 startup            # copy คำสั่งที่มันพิมพ์ออกมาไปรัน เพื่อให้ขึ้นเองหลังรีบูต

pm2 status
pm2 logs kpi-system
```

`DATABASE_URL` อ่านจาก `.env` (Next โหลดให้เอง) ไม่ต้องใส่ใน pm2
แต่ **`PORT` ต้องอยู่ใน `ecosystem.config.js`** เพราะ `next start` อ่าน PORT ตอน CLI เริ่ม

### 4. nginx (พอร์ต 80)

ไฟล์ตัวอย่างอยู่ใน repo แล้ว: `deploy/nginx/kpi-occc.rnk.icu.conf`
proxy `kpi-occc.rnk.icu` -> `127.0.0.1:3777`

```bash
sudo cp /srv/kpi-system/deploy/nginx/kpi-occc.rnk.icu.conf /etc/nginx/sites-available/kpi-occc.rnk.icu
sudo ln -s /etc/nginx/sites-available/kpi-occc.rnk.icu /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default      # ถ้าไม่ได้ใช้ default site
sudo nginx -t && sudo systemctl reload nginx
```

ไม่ต้องเปิดพอร์ต 3777 ออกเน็ต ให้เปิดแค่ 80 (และ 443 ตอนทำ SSL)

```bash
sudo ufw allow 80/tcp
```

ทำ SSL ทีหลังด้วย `sudo certbot --nginx -d kpi-occc.rnk.icu` (certbot จะเติม block 443 ให้เอง)

### 5. อัปเดตเวอร์ชันใหม่ (ทำมือ)

ปกติใช้ GitHub Actions ในหัวข้อ 6 แทน แต่ถ้าจะทำมือ:

```bash
cd /srv/kpi-system
git pull
npm ci
npm run db:migrate         # apply migration ใหม่ (ถ้ามี) — ต้องรันก่อน build เสมอ
npm run build
pm2 reload kpi-system --update-env
```

### 6. Deploy อัตโนมัติด้วย GitHub Actions

workflow: `.github/workflows/deploy.yml` — รันด้วยมือที่แท็บ **Actions → Deploy → Run workflow**
ต้องพิมพ์รหัสผ่านให้ตรงกับ secret `DEPLOY_PASSWORD` ก่อน ถึงจะ ssh เข้าเซิร์ฟเวอร์แล้วรัน
`git reset --hard origin/<branch>` → `npm ci` → `db:migrate` → `build` → `pm2 startOrReload`
แล้วเช็ค health ด้วย `curl http://127.0.0.1:3777/login`

**Secrets ที่ต้องตั้ง** (Settings → Secrets and variables → Actions → New repository secret)

| ชื่อ | จำเป็น | ตัวอย่าง / ค่าเริ่มต้น |
|---|---|---|
| `DEPLOY_PASSWORD` | ✅ | รหัสผ่านยืนยันก่อน deploy |
| `SSH_PRIVATE_KEY` | ✅ | private key ทั้งไฟล์ รวมบรรทัด `-----BEGIN...` / `-----END...` |
| `SSH_HOST` | ✅ | `203.0.113.10` หรือโดเมน |
| `SSH_USER` | ✅ | `kpi` (ผู้ใช้ที่เป็นเจ้าของ `/srv/kpi-system`) |
| `SSH_PORT` | – | ไม่ตั้ง = `22` |
| `APP_DIR` | – | ไม่ตั้ง = `/srv/kpi-system` |
| `PM2_NAME` | – | ไม่ตั้ง = `kpi-system` |
| `APP_PORT` | – | ไม่ตั้ง = `3777` (ใช้เช็ค health อย่างเดียว ตัวจริงอยู่ใน `ecosystem.config.js`) |

เตรียมฝั่งเซิร์ฟเวอร์ (ทำครั้งเดียว)

```bash
# บนเครื่องตัวเอง: สร้างคีย์เฉพาะงาน deploy (ห้ามใส่ passphrase — GA พิมพ์ให้ไม่ได้)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/kpi_deploy -N ""

# บนเซิร์ฟเวอร์ (รันในฐานะ user kpi): อนุญาต public key
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo '<เนื้อหาไฟล์ kpi_deploy.pub>' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

pm2 รันในสิทธิ์ user เดียวกับที่ ssh เข้ามา จึง **ไม่ต้องตั้ง sudo ให้ workflow เลย**
(ขอแค่ `pm2` อยู่ใน PATH ของ user นั้น และเคย `pm2 save` ไว้แล้ว)

เอา **ไฟล์ private key** (`~/.ssh/kpi_deploy` ไม่ใช่ `.pub`) ไปใส่ใน secret `SSH_PRIVATE_KEY`
`.env` บนเซิร์ฟเวอร์ถูก gitignore ไว้ `git reset --hard` จึงไม่ทับ

### 7. สำรอง / กู้คืนข้อมูล

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

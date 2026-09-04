@AGENTS.md

# KPI System

ระบบประเมิน KPI องค์กรแบบหลาย role (multi-tenant รายบริษัท) — Next.js 16 App Router +
React 19 + Tailwind v4 + Prisma 7 + PostgreSQL UI มินิมอลขาวดำ ภาษาไทยทั้งระบบ
deploy บนเซิร์ฟเวอร์ตัวเอง (Node + PostgreSQL ที่ติดตั้งเอง ไม่ได้อยู่บน Vercel/Supabase แล้ว)

## คำสั่ง

```bash
npm run dev                    # dev server (โปรเจกต์นี้ทดสอบบนพอร์ต 3002: PORT=3002 npm run dev)
npm run build                  # production build
npm run lint                   # eslint (flat config)

npm run db:migrate             # prisma migrate deploy — apply migration ที่มีอยู่
npm run db:migrate:dev         # สร้าง migration ใหม่หลังแก้ prisma/schema.prisma
npm run db:seed                # ข้อมูลตัวอย่าง + ตั้งรหัสผ่านให้ทุกบัญชี (รันซ้ำได้)

npm run test:agent                  # E2E crawl สิทธิ์การเข้าถึงทั้ง 7 role (read-only)
npm run test:agent -- --full        # + รัน flow ประเมินจริงครบวงจร (ต้องมี dev server รันอยู่)
```

ยังไม่มี unit test framework — `scripts/test-agent.mjs` คือชุดทดสอบเดียวของโปรเจกต์
ยิง multipart POST เข้า server action จริงแบบ no-JS browser จึงเทสต์ code path จริงไม่ใช่ mock
**รันตัวนี้ทุกครั้งหลังแก้ `lib/actions.ts` หรือ `lib/queries.ts`**

## Environment

`.env` (คัดลอกจาก `.env.example`) — ตัวสำคัญตัวเดียวคือ `DATABASE_URL`
ห้ามใส่ prefix `NEXT_PUBLIC_` กับค่าไหนเลย และห้าม commit `.env`

ต้องมี PostgreSQL ที่ติดตั้งเองทั้งบนเครื่อง dev และบนเซิร์ฟเวอร์ — โปรเจกต์นี้ไม่มี Docker
ไม่มี compose ให้ยก DB ขึ้นมาให้ ต้องเตรียม database + user เองก่อน (ดู README)

## สถาปัตยกรรม — จุดที่ต้องเข้าใจก่อนแก้โค้ด

### 1. รูปแบบ "โหลด DB ทั้งก้อนต่อ 1 request"

หัวใจของโปรเจกต์นี้ ทุกหน้าทำแบบนี้:

```ts
const db = await readDB();            // lib/store.ts — โหลด 9 ตารางใน $transaction เดียว
const rows = usersInDepartment(db, deptId);   // lib/queries.ts — pure sync function
```

- `readDB()` คืน object `DB` เดียวที่มีทุกตารางเป็น array (`lib/types.ts`)
- **ทุกฟังก์ชันใน `lib/queries.ts` เป็น pure sync function ที่รับ `db: DB` เป็นอาร์กิวเมนต์แรก**
  จึงเรียกซ้ำได้อิสระใน `.map()` / JSX โดยไม่ต้อง async
- เหมาะกับสเกลข้อมูลของแอปนี้ (หลักสิบ–ร้อยแถวต่อบริษัท) — อย่าเปลี่ยนไปเป็น query
  รายหน้าโดยไม่จำเป็น จะพัง pattern ของ `queries.ts` ทั้งไฟล์
- เพิ่ม query ใหม่ → เขียนเป็น pure function ใน `lib/queries.ts` **ไม่ใช่** query ในหน้าเพจ

### 2. Prisma ถูกจำกัดไว้แค่ 4 ไฟล์

`lib/prisma.ts` · `lib/store.ts` · `lib/auth.ts` · `lib/actions.ts`

**หน้าเพจและ component ห้าม import `prisma` โดยตรง** ให้ผ่าน `readDB()` / server action เสมอ
client เป็น lazy proxy (สร้างตอนเรียกใช้ครั้งแรก) เพราะ `next build` จะ import ทุกไฟล์
ตอน "Collecting page data" — ถ้า throw ตอน import จะทำให้ build พังแม้ยังไม่ตั้ง `.env`
และเก็บไว้บน `globalThis` เพราะ hot reload จะสร้าง client ใหม่ทุกครั้งจน pool เต็ม

Prisma 7 ไม่มี query engine แบบ binary แล้ว — ต่อผ่าน driver adapter (`@prisma/adapter-pg`)
เท่านั้น และ `prisma.config.ts` แทนที่ block `prisma` ใน package.json (ต้อง `import "dotenv/config"`
เองด้วย เพราะ CLI ไม่โหลด `.env` ให้อัตโนมัติแล้ว)

### 3. การเขียนข้อมูล = server action เท่านั้น

`lib/actions.ts` รวม mutation ทั้งหมด รูปแบบมาตรฐานของทุก action:

```ts
export async function xxxAction(formData: FormData) {
  const me = await requireUser();              // redirect("/login") ถ้าไม่มี session
  if (me.role !== "hr") redirect("/");         // ตรวจสิทธิ์ทุกครั้ง ห้ามเชื่อ UI
  const name = s(formData, "name");            // s()/num() helper อ่าน FormData
  if (!name) { await setFlash("...", "error"); return; }   // validate + flash
  await prisma.x.create({ data: {} });         // Prisma throw เองถ้าพัง
  await setFlash("บันทึกแล้ว");
  revalidatePath("/manage/...");               // ต้องเรียกเสมอหลังเขียน
}
```

- **ตรวจสิทธิ์ role + `companyId` ซ้ำในฝั่ง server ทุก action** — การซ่อนเมนูใน `lib/nav.ts`
  ไม่ใช่ security boundary
- flash message ผ่าน cookie (`lib/flash.ts`) แสดงด้วย `components/FlashToaster.tsx` (sonner)

### 4. กับดัก: updateMany/deleteMany ไม่ throw เมื่อไม่เจอแถว

การกันข้ามบริษัทใช้เงื่อนไขหลายคอลัมน์ (`{ id, companyId: me.companyId }`) ซึ่ง Prisma
`update()`/`delete()` รับไม่ได้ (รับเฉพาะ unique key) จึงต้องใช้ `updateMany`/`deleteMany`
แต่สองตัวนั้น**คืน `count: 0` เงียบ ๆ แทนที่จะ throw** ถ้าไม่เจอแถว

**ทุกจุดที่ใช้ `updateMany`/`deleteMany` เป็นเกราะสิทธิ์ ต้องส่งผลลัพธ์ผ่าน `guardAffected()`**
ไม่งั้นแอปจะแจ้ง "สำเร็จ" ทั้งที่ไม่ได้เขียนอะไรเลย ข้อยกเว้นคือจุดที่ 0 แถวเป็นเรื่องปกติจริง ๆ
(เช่นปิดรอบประเมินเดิมใน `addCycleAction` ตอนสร้างรอบแรกของบริษัท)

### 5. ชนิดข้อมูลที่ Prisma คืนมาไม่ตรงกับ lib/types.ts

แปลงที่ `lib/mappers.ts` **ที่เดียว** ห้ามให้ค่าดิบหลุดออกไปนอกชั้นนี้:

- `timestamptz` → `Date` ต้อง `.toISOString()` (types.ts นิยามเป็น `string`)
- `numeric` → `Prisma.Decimal` ต้อง `.toNumber()` (types.ts นิยามเป็น `number`)
  ระวังเป็นพิเศษ: `Decimal` ผ่านตัวดำเนินการเปรียบเทียบได้โดยไม่ error แต่ผลลัพธ์ผิด
  และกฎ "weight รวมต้องเท่ากับ 100% พอดี" พึ่งการเทียบตัวเลขโดยตรง

เพิ่มคอลัมน์ใหม่ต้องแก้ `prisma/schema.prisma` → `npm run db:migrate:dev` → `lib/types.ts` → mapper

`assessment_items` เป็นตารางแยกแต่ประกอบกลับเป็น `Assessment.items[]` ตอนอ่าน และเขียนแบบ
**ลบทิ้งทั้งชุดแล้ว insert ใหม่** (`replaceAssessmentItems`) ไม่ diff รายแถว
ต้องอยู่ใน `$transaction` เดียวกับการเขียน assessment เสมอ

### 6. Auth เขียนเอง

- session = cookie `uid` (httpOnly, 30 วัน) ใน `lib/auth.ts`
- รหัสผ่าน = scrypt `"salt:hash"` (hex) ใน `lib/password.ts` เก็บที่ `users.password_hash`
- `password_hash` เป็น null = ยังไม่ตั้งรหัสผ่าน เข้าระบบไม่ได้
- `prisma/seed.sql` ไม่มี `password_hash` — `prisma/seed.mjs` เป็นคนตั้งให้หลังรัน SQL
  ถ้าแก้ scrypt ใน `lib/password.ts` ต้องแก้ฟังก์ชันที่คัดลอกไว้ใน `seed.mjs` ให้ตรงกันด้วย

## โครงสร้าง

```
prisma/schema.prisma   schema ต้นทาง (camelCase + @map ลง snake_case)
prisma/migrations/     migration history
prisma/seed.sql        ข้อมูลตัวอย่าง 2 บริษัท
prisma/seed.mjs        รัน seed.sql + ตั้งรหัสผ่าน
prisma.config.ts       ตั้งค่า Prisma CLI (Prisma 7)
lib/types.ts           โมเดลข้อมูล + type DB
lib/prisma.ts          Prisma client (lazy singleton + pg adapter)
lib/store.ts           readDB() โหลดทั้งก้อน + newId(prefix)
lib/queries.ts         selectors + คำนวณคะแนน/AVG/bell curve (pure, รับ db เป็น arg แรก)
lib/actions.ts         server actions ทั้งหมด
lib/mappers.ts         Date/Decimal -> string/number
lib/auth.ts            session cookie + getCurrentUser()
lib/password.ts        scrypt hash/verify + generatePassword()
lib/flash.ts           flash message ผ่าน cookie
lib/nav.ts             เมนูตาม role (UI เท่านั้น ไม่ใช่ security)
app/(app)/             หน้าหลัง login (ทุกหน้า export const dynamic = "force-dynamic")
components/ui.tsx      primitive ขาวดำทั้งหมด (PageTitle/Section/Card/Stat/Score/Th/Td/BarChart/Empty)
scripts/test-agent.mjs ชุดทดสอบ E2E
scripts/backup-db.mjs  pg_dump -> backups/*.sql.gz
```

## โดเมน

**ลำดับชั้น:** องค์กร → ฝ่าย (division) → แผนก (department) → พนักงาน

**7 role:** `admin` (ข้ามบริษัท, `companyId` = null) · `hr` · `ceo` · `division_head` ·
`dept_manager` · `employee`

**Flow ประเมิน:**
1. นิยาม KPI แบบหัวข้ออย่างเดียว (ไม่มี weight/time): องค์กร (HR) → ฝ่าย → แผนก
2. ทุกคนประเมินตนเองที่ `/me/kpi` — ใส่ weight, กรอบเวลา, คะแนนตนเอง และเชื่อม KPI ขึ้นระดับบน
   (พนักงาน→KPI แผนก, ผจก.→KPI ฝ่าย, ผู้บริหารฝ่าย→KPI องค์กร)
3. กดส่ง → status `draft` → `submitted` → หัวหน้าให้คะแนนที่ `/evaluate` → `evaluated`
4. Final Score = คะแนนหัวหน้าถ่วงน้ำหนักตาม weight → Dashboard (AVG แผนก/ฝ่าย/องค์กร + bell curve)

**กติกาที่บังคับใน server action:**
- weight แต่ละรายการต้อง > 0 และ ≤ 100 · คะแนนต้องอยู่ 0–100
- ตอนกดส่ง weight รวมต้องเท่ากับ 100% พอดี (คลาดเคลื่อนได้ 0.01)
- ส่งแล้วล็อก แก้ไม่ได้อีก (HR มีเครื่องมือ reset กลับเป็น draft)
- คะแนนหัวหน้าที่ให้ไว้แล้วต้องคงอยู่เมื่อผู้ถูกประเมินแก้ไขรายการ (merge ด้วย `itemId`)

## ข้อควรระวัง

- **UI ขาวดำล้วน** — ห้ามใส่สีที่ไม่จำเป็น ใช้ primitive จาก `components/ui.tsx` ก่อนเขียน markup ใหม่
- ข้อความ UI ทั้งหมดเป็นภาษาไทย
- id เป็น `text` ไม่ใช่ uuid — สร้างด้วย `newId("u")` / `newId("as")` (prefix: c/u/d/dep/cy/k/as/ann)
- ทุกหน้าใน `app/(app)/` ต้อง `export const dynamic = "force-dynamic"` (ข้อมูลสดเสมอ)
- `lib/store.ts` ใส่ `id: "asc"` เป็น tiebreaker เสมอ เพราะ seed หลายแถวมี `createdAt` ตรงกันเป๊ะ
- `assessments.updatedAt` ใช้ `@updatedAt` ของ Prisma (ไม่มี trigger ใน DB แล้ว) —
  การเขียนด้วย raw SQL จะไม่แตะคอลัมน์นี้ให้
- deploy ผ่าน `.github/workflows/deploy.yml` เท่านั้น (กดเองที่แท็บ Actions ต้องใส่รหัสผ่าน):
  build `output: "standalone"` บน runner → scp tar ขึ้นเซิร์ฟเวอร์ → `prisma migrate deploy`
  ผ่าน ssh tunnel → แตกไฟล์ทับ → `pm2 startOrReload ecosystem.config.js`
  เซิร์ฟเวอร์ไม่มี repo/ไม่ build เอง มีแค่ `.env` + `logs/` ที่ deploy ไม่แตะ
  **migrate ต้องเสร็จก่อนสลับโค้ดใหม่เสมอ** ไม่งั้นแอปใหม่ขึ้นมาเจอ schema เก่า
- แก้ `next.config.ts` ระวัง `output: "standalone"` — เอาออกเมื่อไหร่ deploy พังทันที
  (workflow มัด `.next/standalone` เป็น bundle) และไฟล์ที่ Next trace ไม่เจอจะไม่ถูกส่งขึ้นไปด้วย

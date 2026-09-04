// Seed ข้อมูลตัวอย่าง 2 บริษัท ลงฐานข้อมูลเปล่า
//
//   npm run db:seed
//
// รันซ้ำได้ปลอดภัย — ทุก insert ใน seed.sql ใช้ `on conflict do nothing`
// ต้องรัน `prisma migrate deploy` (npm run db:migrate) ให้ตารางครบก่อน
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const here = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ตั้งค่า DATABASE_URL ก่อน (ดู .env.example)");
  process.exit(1);
}

// รหัสผ่านตั้งต้นของทุกบัญชีในข้อมูลตัวอย่าง — เปลี่ยนได้ด้วย env SEED_PASSWORD
// seed.sql ไม่ได้ใส่ password_hash มาให้ (คอลัมน์เป็น null = เข้าระบบไม่ได้)
// ถ้าไม่ตั้งให้ตรงนี้ จะ seed เสร็จแล้วล็อกอินไม่ได้สักบัญชี
const SEED_PASSWORD = process.env.SEED_PASSWORD || "kpi-demo-2569";

// ต้องตรงกับ lib/password.ts (scrypt, KEY_LEN 64, เก็บเป็น "salt:hash" hex)
// คัดลอกมาไว้ที่นี่เพราะ lib/password.ts เป็น TS และ import "server-only"
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

/** ตัดไฟล์ SQL เป็นทีละ statement — $executeRawUnsafe รับได้ทีละคำสั่งเท่านั้น */
function splitStatements(sql) {
  return sql
    .split(/;\s*\r?\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => {
      if (!chunk) return false;
      // ข้ามก้อนที่มีแต่คอมเมนต์ (ท้ายไฟล์)
      return chunk.split("\n").some((line) => line.trim() && !line.trim().startsWith("--"));
    });
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const statements = splitStatements(readFileSync(join(here, "seed.sql"), "utf8"));
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log(`รัน seed.sql แล้ว ${statements.length} คำสั่ง`);

  // ตั้งรหัสผ่านให้บัญชีที่ยังไม่มี (salt แยกกันคนละอัน)
  const pending = await prisma.user.findMany({ where: { passwordHash: null }, select: { id: true } });
  for (const user of pending) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(SEED_PASSWORD) },
    });
  }

  const total = await prisma.user.count();
  console.log(`ตั้งรหัสผ่านให้ ${pending.length} บัญชี (ทั้งหมด ${total} บัญชี)`);
  console.log(`\nเข้าระบบด้วยรหัสผ่าน: ${SEED_PASSWORD}`);
  console.log("  ผู้ดูแลระบบ  admin@kpi.system");
  console.log("  HR          hr@siamfoods.co.th");
  console.log("  CEO         ceo@siamfoods.co.th");
  console.log("\nเปลี่ยนรหัสผ่านทันทีหลังเข้าระบบครั้งแรก (เมนู บัญชีของฉัน)");
} finally {
  await prisma.$disconnect();
}

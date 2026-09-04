import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ใช้เฉพาะฝั่ง server (Server Components / Server Actions) เท่านั้น
// DATABASE_URL ชี้ไปที่ Postgres ของเราเอง ห้ามใส่ prefix NEXT_PUBLIC_ เด็ดขาด

// Prisma 7 ไม่มี query engine แบบ binary แล้ว — ต้องต่อผ่าน driver adapter (node-postgres)
// เก็บ client ไว้บน globalThis เพราะ hot reload ตอน dev จะ import โมดูลนี้ใหม่ทุกครั้ง
// ถ้าสร้าง client ใหม่ทุกรอบ connection pool จะเต็มภายในไม่กี่นาที
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// สร้าง client แบบ lazy (ตอนถูกเรียกใช้จริงครั้งแรก) แทนที่จะสร้างตอน import โมดูล
// เพราะ `next build` จะ import ทุกไฟล์ระหว่างขั้นตอน "Collecting page data"
// ถ้า throw ตอน import จะทำให้ build พังแม้แต่ตอนที่ยังไม่ได้ตั้งค่า .env
function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("ตั้งค่า DATABASE_URL ใน .env ก่อน (ดู .env.example)");
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    // bind ไว้กับ client ตัวจริง ไม่งั้นเมธอดอย่าง $transaction จะเสีย `this`
    return typeof value === "function" ? value.bind(client) : value;
  },
});

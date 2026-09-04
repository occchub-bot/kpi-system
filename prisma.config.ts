import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

// Prisma 7 ย้ายการตั้งค่า CLI มาไว้ที่ไฟล์นี้ (แทน block `prisma` ใน package.json)
// datasource.url ใช้เฉพาะฝั่ง CLI (migrate / db execute) — ตัวแอปต่อผ่าน driver adapter ใน lib/prisma.ts
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "node prisma/seed.mjs",
  },
});

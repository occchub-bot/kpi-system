// สำรองฐานข้อมูลออกมาเป็นไฟล์ .sql.gz ในโฟลเดอร์ ./backups
//
//   npm run db:backup
//
// ต้องมี pg_dump อยู่ใน PATH (แพ็กเกจ postgresql-client) และ DATABASE_URL ใน .env
// กู้คืนด้วย:
//   gunzip -c backups/<ไฟล์>.sql.gz | psql "$DATABASE_URL"
import "dotenv/config";
import { mkdirSync, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { join } from "node:path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ตั้งค่า DATABASE_URL ใน .env ก่อน (ดู .env.example)");
  process.exit(1);
}

const dir = process.env.BACKUP_DIR || "backups";
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = join(dir, `kpi-${stamp}.sql.gz`);

// --clean --if-exists ทำให้ไฟล์ที่ได้ restore ทับฐานข้อมูลที่มีข้อมูลอยู่แล้วได้เลย
const dump = spawn("pg_dump", ["--clean", "--if-exists", "--dbname", connectionString], {
  stdio: ["ignore", "pipe", "inherit"],
});

const file = createWriteStream(outPath);
dump.stdout.pipe(createGzip()).pipe(file);

dump.on("error", (err) => {
  console.error("เรียก pg_dump ไม่สำเร็จ — ติดตั้ง postgresql-client แล้วลองใหม่");
  console.error(err.message);
  process.exit(1);
});

dump.on("close", (code) => {
  if (code !== 0) {
    console.error(`pg_dump ล้มเหลว (exit ${code})`);
    process.exit(1);
  }
  file.on("close", () => console.log(`สำรองข้อมูลแล้ว: ${outPath}`));
});

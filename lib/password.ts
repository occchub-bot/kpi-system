import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 64;
// ตัดตัวอักษรที่สับสนง่ายออก (0/O, 1/l/I) เพื่อให้พิมพ์ตามง่าย
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = scryptSync(password, salt, KEY_LEN);
  return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf);
}

/** สุ่มรหัสผ่านตั้งต้นให้ผู้ใช้ใหม่ (แสดงครั้งเดียวตอนสร้างบัญชี) */
export function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

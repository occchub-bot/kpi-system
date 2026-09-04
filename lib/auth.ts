import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { toUser } from "./mappers";
import { verifyPassword } from "./password";
import type { User } from "./types";

const COOKIE = "uid";

/** ผู้ใช้ปัจจุบันจาก cookie (null ถ้ายังไม่ล็อกอิน) */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const uid = jar.get(COOKIE)?.value;
  if (!uid) return null;
  const row = await prisma.user.findUnique({ where: { id: uid } });
  if (!row) return null;
  return toUser(row);
}

export async function setSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** ตรวจอีเมล + รหัสผ่าน คืน user ถ้าถูกต้อง (login) */
export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  // อีเมลใน DB อาจมีตัวพิมพ์ใหญ่ปน — เทียบแบบไม่สนตัวพิมพ์ (เดิมใช้ ilike ของ PostgREST)
  const row = await prisma.user.findFirst({ where: { email: { equals: e, mode: "insensitive" } } });
  if (!row) return null;
  if (!verifyPassword(password, row.passwordHash)) return null;
  return toUser(row);
}

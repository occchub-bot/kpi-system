import { cookies } from "next/headers";
import { supabase } from "./supabase";
import { toUser } from "./mappers";
import type { User } from "./types";

const COOKIE = "uid";

/** ผู้ใช้ปัจจุบันจาก cookie (null ถ้ายังไม่ล็อกอิน) */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const uid = jar.get(COOKIE)?.value;
  if (!uid) return null;
  const { data, error } = await supabase.from("users").select("*").eq("id", uid).maybeSingle();
  if (error || !data) return null;
  return toUser(data);
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

/** หา user จากอีเมล (login passwordless) */
export async function findUserByEmail(email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  const { data, error } = await supabase.from("users").select("*").ilike("email", e).maybeSingle();
  if (error || !data) return null;
  return toUser(data);
}

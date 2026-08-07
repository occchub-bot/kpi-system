import { cookies } from "next/headers";

export type FlashType = "success" | "error";

/** ตั้งข้อความ toast (เรียกใน server action ก่อน return/redirect) */
export async function setFlash(message: string, type: FlashType = "success") {
  const jar = await cookies();
  jar.set("flash", `${type}|${encodeURIComponent(message)}`, {
    path: "/",
    maxAge: 30,
    httpOnly: false, // ให้ client เคลียร์เองได้
    sameSite: "lax",
  });
}

/** อ่านค่า flash cookie ดิบ (ส่งให้ client toaster) */
export async function readFlashRaw(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("flash")?.value ?? null;
}

/**
 * ตั้งรหัสผ่านที่สุ่มไว้ให้โชว์เป็น modal ค้างไว้จนกว่าจะปิดเอง (ไม่ auto-dismiss แบบ toast)
 * ใช้แทนการแปะรหัสผ่านไว้ในข้อความ flash เฉยๆ ซึ่งพลาดดูง่ายและก็อปยาก
 */
export async function setPasswordReveal(label: string, password: string) {
  const jar = await cookies();
  jar.set("pwreveal", `${encodeURIComponent(label)}|${encodeURIComponent(password)}`, {
    path: "/",
    maxAge: 60,
    httpOnly: false,
    sameSite: "lax",
  });
}

export async function readPasswordRevealRaw(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("pwreveal")?.value ?? null;
}

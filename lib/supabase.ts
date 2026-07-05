import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// ใช้เฉพาะฝั่ง server (Server Components / Server Actions) เท่านั้น
// service_role key มีสิทธิ์เต็ม (bypass RLS) ห้าม expose ไปฝั่ง client เด็ดขาด
// อย่าตั้งชื่อ env ตัวนี้ด้วย prefix NEXT_PUBLIC_

// สร้าง client แบบ lazy (ตอนถูกเรียกใช้จริงครั้งแรก) แทนที่จะสร้างตอน import โมดูล
// เพราะ `next build` จะ import ทุกไฟล์ระหว่างขั้นตอน "Collecting page data"
// ถ้า throw ตอน import จะทำให้ build พังแม้แต่ตอนที่ยังไม่ได้ตั้งค่า .env.local
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local ก่อน (ดู .env.local.example)"
    );
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false },
    // แอปนี้ไม่ใช้ realtime subscriptions เลย แต่ supabase-js สร้าง RealtimeClient
    // ในตัว constructor เสมอ ซึ่งต้องการ WebSocket global (Node 20 ยังไม่มีในตัว
    // ต่างจาก Node 22+) — ใส่ ws เข้าไปกันไม่ให้ throw ตอนสร้าง client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  });
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

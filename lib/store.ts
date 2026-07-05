import { supabase } from "./supabase";
import type { Assessment, DB } from "./types";
import {
  toAnnouncement,
  toAssessment,
  toAssessmentItem,
  toCompany,
  toCycle,
  toDepartment,
  toDivision,
  toKpi,
  toUser,
} from "./mappers";

/**
 * โหลดข้อมูลทั้งหมดจาก Supabase แล้วประกอบกลับเป็นรูปทรง DB เดิม
 * (เหมือนที่เคยอ่านทั้งไฟล์ data/store.json ในเวอร์ชันก่อนหน้า)
 * เหมาะกับสเกลข้อมูลของแอปนี้ (หลักสิบ-ร้อยแถวต่อบริษัท) — query ตรง ๆ ต่อครั้งไม่คุ้มกว่านี้
 */
export async function readDB(): Promise<DB> {
  const [
    companiesRes,
    divisionsRes,
    departmentsRes,
    usersRes,
    cyclesRes,
    kpisRes,
    assessmentsRes,
    itemsRes,
    announcementsRes,
  ] = await Promise.all([
    // Postgres/PostgREST ไม่รับประกันลำดับแถวถ้าไม่ใส่ order — ใส่ไว้ให้ลำดับคงที่
    // เหมือนตอนอ่านจากไฟล์ JSON เดิม ใส่ `id` เป็น tiebreaker เสมอเพราะข้อมูล seed
    // เดิมหลายแถวมี created_at ตรงกันเป๊ะ (constant เดียวกันตอน seed) ทำให้ order by
    // created_at อย่างเดียวยังสุ่มลำดับได้ในแถวที่เวลาเท่ากัน
    supabase.from("companies").select("*").order("created_at").order("id"),
    supabase.from("divisions").select("*").order("id"),
    supabase.from("departments").select("*").order("id"),
    supabase.from("users").select("*").order("created_at").order("id"),
    supabase.from("cycles").select("*").order("created_at").order("id"),
    supabase.from("kpis").select("*").order("created_at").order("id"),
    supabase.from("assessments").select("*").order("created_at").order("id"),
    supabase.from("assessment_items").select("*").order("position"),
    supabase.from("announcements").select("*").order("created_at").order("id"),
  ]);

  for (const res of [
    companiesRes,
    divisionsRes,
    departmentsRes,
    usersRes,
    cyclesRes,
    kpisRes,
    assessmentsRes,
    itemsRes,
    announcementsRes,
  ]) {
    if (res.error) throw new Error(`Supabase read failed: ${res.error.message}`);
  }

  const itemsByAssessment = new Map<string, ReturnType<typeof toAssessmentItem>[]>();
  for (const row of itemsRes.data ?? []) {
    const arr = itemsByAssessment.get(row.assessment_id) ?? [];
    arr.push(toAssessmentItem(row));
    itemsByAssessment.set(row.assessment_id, arr);
  }

  const assessments: Assessment[] = (assessmentsRes.data ?? []).map((r) =>
    toAssessment(r, itemsByAssessment.get(r.id) ?? [])
  );

  return {
    companies: (companiesRes.data ?? []).map(toCompany),
    divisions: (divisionsRes.data ?? []).map(toDivision),
    departments: (departmentsRes.data ?? []).map(toDepartment),
    users: (usersRes.data ?? []).map(toUser),
    cycles: (cyclesRes.data ?? []).map(toCycle),
    kpis: (kpisRes.data ?? []).map(toKpi),
    assessments,
    announcements: (announcementsRes.data ?? []).map(toAnnouncement),
  };
}

let counter = 0;
/** สร้าง id อย่างง่าย (prototype) */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

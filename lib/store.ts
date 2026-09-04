import { prisma } from "./prisma";
import type { Assessment, AssessmentItem, DB } from "./types";
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
 * โหลดข้อมูลทั้งหมดจาก Postgres แล้วประกอบกลับเป็นรูปทรง DB เดิม
 * เหมาะกับสเกลข้อมูลของแอปนี้ (หลักสิบ-ร้อยแถวต่อบริษัท) — query ตรง ๆ ต่อครั้งไม่คุ้มกว่านี้
 *
 * ใช้ $transaction เพื่อให้ทั้ง 9 query อ่านจาก snapshot เดียวกัน — ไม่มีโอกาสได้ภาพครึ่ง ๆ กลาง ๆ
 * ถ้ามีคนเขียนข้อมูลอยู่ระหว่างที่หน้ากำลังโหลด
 */
export async function readDB(): Promise<DB> {
  // Postgres ไม่รับประกันลำดับแถวถ้าไม่ใส่ order — ใส่ `id` เป็น tiebreaker เสมอ
  // เพราะข้อมูล seed หลายแถวมี createdAt ตรงกันเป๊ะ (constant เดียวกันตอน seed)
  // ทำให้ order by createdAt อย่างเดียวยังสุ่มลำดับได้ในแถวที่เวลาเท่ากัน
  const [companies, divisions, departments, users, cycles, kpis, assessments, itemRows, announcements] =
    await prisma.$transaction([
      prisma.company.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.division.findMany({ orderBy: { id: "asc" } }),
      prisma.department.findMany({ orderBy: { id: "asc" } }),
      prisma.user.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.cycle.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.kpi.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.assessment.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.assessmentItem.findMany({ orderBy: { position: "asc" } }),
      prisma.announcement.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ]);

  const itemsByAssessment = new Map<string, AssessmentItem[]>();
  for (const row of itemRows) {
    const arr = itemsByAssessment.get(row.assessmentId) ?? [];
    arr.push(toAssessmentItem(row));
    itemsByAssessment.set(row.assessmentId, arr);
  }

  const assessmentEntities: Assessment[] = assessments.map((r) =>
    toAssessment(r, itemsByAssessment.get(r.id) ?? [])
  );

  return {
    companies: companies.map(toCompany),
    divisions: divisions.map(toDivision),
    departments: departments.map(toDepartment),
    users: users.map(toUser),
    cycles: cycles.map(toCycle),
    kpis: kpis.map(toKpi),
    assessments: assessmentEntities,
    announcements: announcements.map(toAnnouncement),
  };
}

let counter = 0;
/** สร้าง id อย่างง่าย (prototype) */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

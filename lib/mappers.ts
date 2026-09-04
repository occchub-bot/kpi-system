// แปลง row จาก Prisma เป็น entity ของแอปตาม lib/types.ts
//
// ชื่อ field ตรงกันอยู่แล้ว (schema.prisma ประกาศเป็น camelCase แล้ว @map ลงคอลัมน์ snake_case)
// เหลืองานแปลงชนิดข้อมูล 2 อย่างที่ Prisma คืนมาไม่ตรงกับ lib/types.ts:
//   timestamptz -> Date    ต้องแปลงเป็น ISO string
//   numeric     -> Decimal ต้องแปลงเป็น number
import type {
  Announcement as AnnouncementRow,
  Assessment as AssessmentRow,
  AssessmentItem as AssessmentItemRow,
  Company as CompanyRow,
  Cycle as CycleRow,
  Department as DepartmentRow,
  Division as DivisionRow,
  Kpi as KpiRow,
  Prisma,
  User as UserRow,
} from "@prisma/client";
import type {
  Announcement,
  Assessment,
  AssessmentItem,
  Company,
  Cycle,
  Department,
  Division,
  Kpi,
  User,
} from "./types";

/** Decimal (numeric) -> number */
function dec(v: Prisma.Decimal): number {
  return v.toNumber();
}

/** Decimal | null -> number | null */
function decOrNull(v: Prisma.Decimal | null): number | null {
  return v === null ? null : v.toNumber();
}

/** Date | null -> ISO string | null */
function isoOrNull(v: Date | null): string | null {
  return v === null ? null : v.toISOString();
}

export function toCompany(r: CompanyRow): Company {
  return { id: r.id, name: r.name, createdAt: r.createdAt.toISOString() };
}

export function toDivision(r: DivisionRow): Division {
  return { id: r.id, companyId: r.companyId, name: r.name, headUserId: r.headUserId };
}

export function toDepartment(r: DepartmentRow): Department {
  return {
    id: r.id,
    companyId: r.companyId,
    divisionId: r.divisionId,
    name: r.name,
    headUserId: r.headUserId,
  };
}

export function toUser(r: UserRow): User {
  return {
    id: r.id,
    companyId: r.companyId,
    empId: r.empId,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    divisionId: r.divisionId,
    departmentId: r.departmentId,
    position: r.position,
    managerId: r.managerId,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toCycle(r: CycleRow): Cycle {
  return {
    id: r.id,
    companyId: r.companyId,
    name: r.name,
    year: r.year,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toKpi(r: KpiRow): Kpi {
  return {
    id: r.id,
    companyId: r.companyId,
    level: r.level,
    title: r.title,
    divisionId: r.divisionId,
    departmentId: r.departmentId,
    parentKpiId: r.parentKpiId,
    createdById: r.createdById ?? "",
    createdAt: r.createdAt.toISOString(),
  };
}

export function toAssessmentItem(r: AssessmentItemRow): AssessmentItem {
  return {
    id: r.itemId,
    title: r.title,
    weight: dec(r.weight),
    target: r.target,
    linkedKpiId: r.linkedKpiId,
    selfScore: dec(r.selfScore),
    selfComment: r.selfComment,
    evalScore: decOrNull(r.evalScore),
    evalComment: r.evalComment,
  };
}

export function toAssessment(r: AssessmentRow, items: AssessmentItem[]): Assessment {
  return {
    id: r.id,
    companyId: r.companyId,
    cycleId: r.cycleId,
    userId: r.userId,
    evaluatorId: r.evaluatorId,
    items,
    remark: r.remark ?? undefined,
    status: r.status,
    selfTotal: decOrNull(r.selfTotal),
    finalScore: decOrNull(r.finalScore),
    submittedAt: isoOrNull(r.submittedAt),
    evaluatedAt: isoOrNull(r.evaluatedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: r.id,
    companyId: r.companyId,
    message: r.message,
    createdById: r.createdById ?? "",
    createdAt: r.createdAt.toISOString(),
  };
}

/** แปลง AssessmentItem[] ของ Assessment หนึ่งรายการ ให้เป็น row สำหรับ createMany */
export function itemsToRows(
  assessmentId: string,
  items: AssessmentItem[]
): Prisma.AssessmentItemCreateManyInput[] {
  return items.map((it, idx) => ({
    assessmentId,
    itemId: it.id,
    position: idx,
    title: it.title,
    weight: it.weight,
    target: it.target,
    linkedKpiId: it.linkedKpiId,
    selfScore: it.selfScore,
    selfComment: it.selfComment,
    evalScore: it.evalScore,
    evalComment: it.evalComment,
  }));
}

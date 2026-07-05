import type {
  Announcement,
  Assessment,
  Company,
  Cycle,
  DB,
  Department,
  Division,
  Kpi,
  KpiLevel,
  User,
} from "./types";

// หมายเหตุสถาปัตยกรรม: แต่ละหน้าจะโหลด DB ทั้งก้อนครั้งเดียวด้วย `await readDB()`
// (จาก lib/store.ts) แล้วส่ง snapshot นั้นเข้ามาเป็นอาร์กิวเมนต์ `db` ของทุกฟังก์ชันด้านล่าง
// ทำให้ฟังก์ชัน query/aggregate ทั้งหมดยังเป็น pure sync function เหมือนเดิม
// เรียกใช้ซ้ำได้อิสระใน .map()/JSX โดยไม่ต้องยุ่งกับ async

/* ---------------- lookups ---------------- */
export function getCompany(db: DB, id: string | null): Company | null {
  if (!id) return null;
  return db.companies.find((c) => c.id === id) ?? null;
}
export function getUser(db: DB, id: string | null): User | null {
  if (!id) return null;
  return db.users.find((u) => u.id === id) ?? null;
}
export function userName(db: DB, id: string | null): string {
  return getUser(db, id)?.name ?? "—";
}
export function getDivision(db: DB, id: string | null): Division | null {
  if (!id) return null;
  return db.divisions.find((d) => d.id === id) ?? null;
}
export function getDepartment(db: DB, id: string | null): Department | null {
  if (!id) return null;
  return db.departments.find((d) => d.id === id) ?? null;
}

/* ---------------- collections ---------------- */
export function companies(db: DB): Company[] {
  return db.companies;
}
export function divisionsOf(db: DB, companyId: string): Division[] {
  return db.divisions.filter((d) => d.companyId === companyId);
}
export function departmentsOf(db: DB, companyId: string): Department[] {
  return db.departments.filter((d) => d.companyId === companyId);
}
export function departmentsInDivision(db: DB, divisionId: string): Department[] {
  return db.departments.filter((d) => d.divisionId === divisionId);
}
export function usersOf(db: DB, companyId: string): User[] {
  return db.users.filter((u) => u.companyId === companyId);
}
export function usersInDepartment(db: DB, deptId: string): User[] {
  return db.users.filter((u) => u.departmentId === deptId);
}
export function usersInDivision(db: DB, divisionId: string): User[] {
  return db.users.filter((u) => u.divisionId === divisionId);
}
export function subordinatesOf(db: DB, userId: string): User[] {
  return db.users.filter((u) => u.managerId === userId);
}

/* ---------------- active/inactive (พนักงานที่ปิดใช้งานไม่นำคะแนนมาคิด) ---------------- */
export function isActiveUser(u: User): boolean {
  return u.isActive !== false;
}
export function activeUsersOf(db: DB, companyId: string): User[] {
  return usersOf(db, companyId).filter(isActiveUser);
}
export function activeUsersInDepartment(db: DB, deptId: string): User[] {
  return usersInDepartment(db, deptId).filter(isActiveUser);
}
export function activeUsersInDivision(db: DB, divisionId: string): User[] {
  return usersInDivision(db, divisionId).filter(isActiveUser);
}

/* ---------------- cycles ---------------- */
export function cyclesOf(db: DB, companyId: string): Cycle[] {
  return db.cycles
    .filter((c) => c.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function activeCycle(db: DB, companyId: string): Cycle | null {
  const list = cyclesOf(db, companyId);
  return list.find((c) => c.active) ?? list[0] ?? null;
}
export function getCycle(db: DB, id: string | null): Cycle | null {
  if (!id) return null;
  return db.cycles.find((c) => c.id === id) ?? null;
}

/* ---------------- KPIs ---------------- */
export function kpisOf(db: DB, companyId: string, level?: KpiLevel): Kpi[] {
  return db.kpis.filter((k) => k.companyId === companyId && (!level || k.level === level));
}
export function divisionKpis(db: DB, divisionId: string): Kpi[] {
  return db.kpis.filter((k) => k.level === "division" && k.divisionId === divisionId);
}
export function departmentKpis(db: DB, deptId: string): Kpi[] {
  return db.kpis.filter((k) => k.level === "department" && k.departmentId === deptId);
}
export function getKpi(db: DB, id: string | null): Kpi | null {
  if (!id) return null;
  return db.kpis.find((k) => k.id === id) ?? null;
}

/**
 * KPI ระดับบนที่ผู้ใช้สามารถ "เชื่อม" ได้ตอนประเมินตนเอง
 * - employee → KPI แผนกของตน
 * - dept_manager → KPI ฝ่ายของตน
 * - division_head → KPI องค์กร
 * - hr/ceo → KPI องค์กร
 */
export function linkableKpisFor(db: DB, user: User): Kpi[] {
  if (!user.companyId) return [];
  switch (user.role) {
    case "employee":
      return user.departmentId ? departmentKpis(db, user.departmentId) : [];
    case "dept_manager":
      return user.divisionId ? divisionKpis(db, user.divisionId) : [];
    default:
      return kpisOf(db, user.companyId, "org");
  }
}

/* ---------------- assessments ---------------- */
export function assessmentOf(db: DB, userId: string, cycleId: string): Assessment | null {
  return db.assessments.find((a) => a.userId === userId && a.cycleId === cycleId) ?? null;
}
export function finalScoreOf(db: DB, userId: string, cycleId: string): number | null {
  const a = assessmentOf(db, userId, cycleId);
  return a && a.status === "evaluated" ? a.finalScore : null;
}
/** รายการที่ลูกน้องส่งมาให้ผู้ใช้ประเมิน ในรอบที่กำหนด */
export function incomingAssessments(db: DB, evaluatorId: string, cycleId: string): Assessment[] {
  const subs = subordinatesOf(db, evaluatorId).map((u) => u.id);
  return db.assessments.filter((a) => a.cycleId === cycleId && subs.includes(a.userId));
}

/* ---------------- scoring / aggregation ---------------- */
export function computeWeighted(
  items: { weight: number; score: number | null }[],
  field: "self" | "eval" = "eval"
): number | null {
  void field;
  const valid = items.filter((i) => i.score !== null);
  if (valid.length === 0) return null;
  const totalW = valid.reduce((s, i) => s + (i.weight || 0), 0);
  if (totalW <= 0) return null;
  const sum = valid.reduce((s, i) => s + (i.weight || 0) * (i.score as number), 0);
  return Math.round((sum / totalW) * 10) / 10;
}

export function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

/** คะแนนเฉลี่ยของกลุ่มผู้ใช้ในรอบหนึ่ง (เฉพาะที่ประเมินแล้ว) */
export function avgScoreOfUsers(db: DB, userIds: string[], cycleId: string): number | null {
  const scores = userIds
    .map((id) => finalScoreOf(db, id, cycleId))
    .filter((s): s is number => s !== null);
  return avg(scores);
}

export function departmentAvg(db: DB, deptId: string, cycleId: string): number | null {
  return avgScoreOfUsers(db, activeUsersInDepartment(db, deptId).map((u) => u.id), cycleId);
}
export function divisionAvg(db: DB, divisionId: string, cycleId: string): number | null {
  return avgScoreOfUsers(db, activeUsersInDivision(db, divisionId).map((u) => u.id), cycleId);
}
export function companyAvg(db: DB, companyId: string, cycleId: string): number | null {
  return avgScoreOfUsers(db, activeUsersOf(db, companyId).map((u) => u.id), cycleId);
}

/* ---------------- filter ตามปี (รอบประเมินหนึ่งปีอาจมีหลายรอบ) ---------------- */
export function yearsOf(db: DB, companyId: string): number[] {
  const ys = new Set(cyclesOf(db, companyId).map((c) => c.year));
  return Array.from(ys).sort((a, b) => b - a);
}
export function cyclesInYear(db: DB, companyId: string, year: number): Cycle[] {
  return cyclesOf(db, companyId).filter((c) => c.year === year);
}
/** คะแนนเฉลี่ยของพนักงานคนหนึ่งในปีที่กำหนด (เฉลี่ยทุกรอบของปีนั้นที่ประเมินแล้ว) */
export function userScoreInYear(db: DB, userId: string, companyId: string, year: number): number | null {
  const cycleIds = cyclesInYear(db, companyId, year).map((c) => c.id);
  const scores = cycleIds
    .map((cid) => finalScoreOf(db, userId, cid))
    .filter((s): s is number => s !== null);
  return avg(scores);
}
export function avgScoreOfUsersForYear(
  db: DB,
  userIds: string[],
  companyId: string,
  year: number
): number | null {
  const scores = userIds
    .map((id) => userScoreInYear(db, id, companyId, year))
    .filter((s): s is number => s !== null);
  return avg(scores);
}
export function departmentAvgYear(db: DB, deptId: string, companyId: string, year: number): number | null {
  return avgScoreOfUsersForYear(db, activeUsersInDepartment(db, deptId).map((u) => u.id), companyId, year);
}
export function divisionAvgYear(db: DB, divisionId: string, companyId: string, year: number): number | null {
  return avgScoreOfUsersForYear(db, activeUsersInDivision(db, divisionId).map((u) => u.id), companyId, year);
}
export function companyAvgYear(db: DB, companyId: string, year: number): number | null {
  return avgScoreOfUsersForYear(db, activeUsersOf(db, companyId).map((u) => u.id), companyId, year);
}
/** คะแนนเฉลี่ยรายปีของพนักงาน active ทุกคนในองค์กร — ใช้ทำ Bell curve ระดับองค์กร */
export function orgScoresForYear(db: DB, companyId: string, year: number): number[] {
  return activeUsersOf(db, companyId)
    .map((u) => userScoreInYear(db, u.id, companyId, year))
    .filter((s): s is number => s !== null);
}

/* ---------------- bell curve ---------------- */
export interface Bucket {
  label: string;
  min: number;
  max: number;
  count: number;
}
/** จัดกลุ่มคะแนนเป็นช่วง ๆ สำหรับกราฟกระจายตัว */
export function bellCurve(scores: number[]): Bucket[] {
  const ranges: [number, number, string][] = [
    [0, 50, "0–49"],
    [50, 60, "50–59"],
    [60, 70, "60–69"],
    [70, 80, "70–79"],
    [80, 90, "80–89"],
    [90, 101, "90–100"],
  ];
  return ranges.map(([min, max, label]) => ({
    label,
    min,
    max,
    count: scores.filter((s) => s >= min && s < max).length,
  }));
}

/* ---------------- ประกาศจาก HR ---------------- */
export function announcementsOf(db: DB, companyId: string): Announcement[] {
  return db.announcements
    .filter((a) => a.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function latestAnnouncement(db: DB, companyId: string): Announcement | null {
  return announcementsOf(db, companyId)[0] ?? null;
}

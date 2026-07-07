// ─────────────────────────────────────────────────────────────
// โมเดลข้อมูลระบบ KPI
// ลำดับชั้น: องค์กร → ฝ่าย (division) → แผนก (department) → พนักงาน
// ─────────────────────────────────────────────────────────────

export type Role =
  | "admin" // ผู้ดูแลระบบ (เห็นทุกบริษัท)
  | "hr" // ฝ่ายบุคคลของบริษัท (ตั้งค่าโครงสร้าง/รอบ/KPI องค์กร)
  | "ceo" // ผู้บริหารองค์กร (C level)
  | "division_head" // ผู้บริหารฝ่าย
  | "dept_manager" // ผู้จัดการแผนก
  | "employee"; // พนักงาน

export interface Company {
  id: string;
  name: string;
  createdAt: string;
}

export interface Division {
  id: string;
  companyId: string;
  name: string;
  headUserId: string | null; // ผู้บริหารฝ่าย
}

export interface Department {
  id: string;
  companyId: string;
  divisionId: string;
  name: string;
  headUserId: string | null; // ผู้จัดการแผนก
}

export interface User {
  id: string;
  companyId: string | null; // admin = null
  empId: string; // รหัสพนักงาน เช่น MGR-001
  name: string;
  email: string;
  phone: string;
  role: Role;
  divisionId: string | null;
  departmentId: string | null;
  position: string; // ตำแหน่ง
  managerId: string | null; // หัวหน้างานผู้ประเมิน
  isActive?: boolean; // false = ปิดใช้งาน (ไม่นำคะแนนมาคิดเฉลี่ย) — ค่าเริ่มต้นถือว่า active
  createdAt: string;
}

export interface Cycle {
  id: string;
  companyId: string;
  name: string; // เช่น รอบ 1/2568
  year: number;
  active: boolean;
  createdAt: string;
}

// KPI ที่นิยามไว้ (ไม่มี weight/time) — ใช้เป็นตัวให้เลือกเชื่อมตอนประเมินตนเอง
export type KpiLevel = "org" | "division" | "department";

export interface Kpi {
  id: string;
  companyId: string;
  level: KpiLevel;
  title: string;
  // ขอบเขตของ KPI ตามระดับ
  divisionId: string | null; // level=division
  departmentId: string | null; // level=department
  // การเชื่อมขึ้นไปยังระดับบน (cascade)
  parentKpiId: string | null;
  createdById: string;
  createdAt: string;
}

// รายการ KPI ในการประเมินตนเอง (มี weight/time + เชื่อม KPI ระดับบน)
export interface AssessmentItem {
  id: string;
  title: string;
  weight: number; // %
  target: string; // เป้าหมาย/กรอบเวลา (time)
  linkedKpiId: string | null; // เชื่อมกับ KPI ระดับบน
  selfScore: number; // คะแนนประเมินตนเอง 0-100
  selfComment: string; // โน๊ตจากพนักงานถึงหัวหน้า
  evalScore: number | null; // คะแนนที่หัวหน้าให้ 0-100
  evalComment: string; // ความเห็นจากหัวหน้า
}

export type AssessmentStatus = "draft" | "submitted" | "evaluated";

export interface Assessment {
  id: string;
  companyId: string;
  cycleId: string;
  userId: string; // ผู้ถูกประเมิน (เจ้าของ)
  evaluatorId: string | null; // หัวหน้าผู้ประเมิน (snapshot จาก managerId)
  items: AssessmentItem[];
  remark?: string; // หมายเหตุรวมของผู้ถูกประเมิน
  status: AssessmentStatus;
  selfTotal: number | null; // ผลรวมถ่วงน้ำหนักจากคะแนนตนเอง
  finalScore: number | null; // ผลรวมถ่วงน้ำหนักจากคะแนนหัวหน้า
  submittedAt: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** ข้อความประกาศจาก HR ถึงพนักงานทุกคนในบริษัท */
export interface Announcement {
  id: string;
  companyId: string;
  message: string;
  createdById: string;
  createdAt: string;
}

export interface DB {
  companies: Company[];
  divisions: Division[];
  departments: Department[];
  users: User[];
  cycles: Cycle[];
  kpis: Kpi[];
  assessments: Assessment[];
  announcements: Announcement[];
}

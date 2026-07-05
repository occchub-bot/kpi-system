import type { Role, User } from "./types";
import type { Tone } from "@/components/ui";

export function roleLabel(role: Role): string {
  return (
    {
      admin: "ผู้ดูแลระบบ",
      hr: "ฝ่ายบุคคล (HR)",
      ceo: "ผู้บริหารสูงสุด (CEO)",
      division_head: "ผู้บริหารฝ่าย",
      dept_manager: "ผู้จัดการแผนก",
      employee: "พนักงาน",
    }[role] ?? role
  );
}

/**
 * ชื่อระดับ KPI ที่ผู้ใช้แต่ละบทบาทเชื่อมต่อขึ้นไป
 * employee → KPI แผนก · dept_manager → KPI ฝ่าย · ระดับอื่น (division_head/hr/ceo) → KPI องค์กร
 */
export function kpiLevelLabel(role: Role): string {
  if (role === "employee") return "KPI แผนก";
  if (role === "dept_manager") return "KPI ฝ่าย";
  return "KPI องค์กร";
}

/** สีประจำบทบาท ใช้กับ Badge ในตารางพนักงาน */
export function roleTone(role: Role): Tone {
  return (
    {
      admin: "purple",
      hr: "pink",
      ceo: "indigo",
      division_head: "blue",
      dept_manager: "amber",
      employee: "green",
    } as const
  )[role] ?? "neutral";
}

export interface NavItem {
  href: string;
  label: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

const personal: NavSection = {
  title: "ส่วนบุคคล",
  items: [
    { href: "/me", label: "Dashboard ของตนเอง" },
    { href: "/me/kpi", label: "KPI ของตนเอง" },
  ],
};

/** เมนูตาม role */
export function buildNav(user: User): NavSection[] {
  switch (user.role) {
    case "admin":
      return [
        { title: "ผู้ดูแลระบบ", items: [{ href: "/admin", label: "บริษัททั้งหมด" }] },
      ];
    case "hr":
      // HR เป็นบัญชีกลาง (ใครเข้าก็ได้) — ไม่มีส่วนบุคคล
      return [
        {
          title: "ส่วนองค์กร",
          items: [
            { href: "/dashboard", label: "Dashboard องค์กร" },
            { href: "/manage", label: "การจัดการ" },
          ],
        },
      ];
    case "ceo":
      // CEO เป็นระดับสูงสุด — ไม่มีหัวหน้าประเมิน จึงไม่มีส่วนบุคคล
      // และไม่มีหน้าที่จัดการ (KPI องค์กรเป็นของ HR)
      return [
        {
          title: "ส่วนองค์กร",
          items: [
            { href: "/dashboard", label: "Dashboard องค์กร" },
            { href: "/evaluate", label: "ประเมินผู้ใต้บังคับบัญชา" },
          ],
        },
      ];
    case "division_head":
      return [
        {
          title: "ส่วนของฝ่าย",
          items: [
            { href: "/dashboard", label: "Dashboard ฝ่าย" },
            { href: "/manage", label: "การจัดการ" },
          ],
        },
        personal,
      ];
    case "dept_manager":
      return [
        {
          title: "ส่วนของแผนก",
          items: [
            { href: "/dashboard", label: "Dashboard แผนก" },
            { href: "/manage", label: "การจัดการ" },
          ],
        },
        personal,
      ];
    case "employee":
    default:
      return [personal];
  }
}

export function landingPath(user: User): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "employee") return "/me";
  return "/dashboard";
}

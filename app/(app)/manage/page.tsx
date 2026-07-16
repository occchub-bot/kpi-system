import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Tile {
  href: string;
  title: string;
  desc: string;
}

export default async function ManagePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "admin") redirect("/admin");
  if (me.role === "employee") redirect("/me");
  // ผู้บริหารองค์กร (C level) ไม่มีหน้าที่จัดการ (KPI องค์กรเป็นของ HR)
  if (me.role === "ceo") redirect("/dashboard");

  const hrTiles: Tile[] = [
    { href: "/manage/divisions", title: "ฝ่าย", desc: "เพิ่ม/จัดการฝ่ายในองค์กร" },
    { href: "/manage/departments", title: "แผนก", desc: "เพิ่มแผนกในแต่ละฝ่าย" },
    { href: "/manage/employees", title: "พนักงาน", desc: "เพิ่มพนักงาน กำหนดผู้บังคับบัญชาผู้ประเมิน" },
    { href: "/manage/cycles", title: "รอบประเมิน", desc: "สร้างรอบประเมิน KPI ต่อปี" },
    { href: "/manage/org-kpi", title: "KPI องค์กร", desc: "กำหนด KPI หลักขององค์กร" },
    { href: "/manage/announce", title: "ส่งข้อความถึงพนักงาน", desc: "ส่งข้อความเดียวกันถึงพนักงานทุกคนในบริษัท" },
  ];
  const evalTile: Tile = {
    href: "/evaluate",
    title: "ประเมินผู้ใต้บังคับบัญชา",
    desc: "ตรวจและให้คะแนนผู้ใต้บังคับบัญชาตามรอบ",
  };
  const unitTiles: Tile[] = [
    {
      href: "/manage/unit-kpi",
      title: me.role === "division_head" ? "KPI ฝ่าย" : "KPI แผนก",
      desc: "เพิ่ม KPI ของหน่วยงาน เชื่อมกับ KPI ระดับบน",
    },
    evalTile,
  ];

  let tiles: Tile[] = [];
  if (me.role === "hr") tiles = hrTiles;
  else if (me.role === "division_head" || me.role === "dept_manager") tiles = unitTiles;

  return (
    <div>
      <PageTitle>การจัดการ</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-xl border border-[var(--border)] bg-white p-5 transition-colors hover:border-brand-700"
          >
            <p className="font-semibold">{t.title}</p>
            <p className="mt-1 text-sm text-neutral-500">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

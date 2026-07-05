import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { buildNav, roleLabel } from "@/lib/nav";
import { readDB } from "@/lib/store";
import { getCompany, getDepartment, getDivision, latestAnnouncement } from "@/lib/queries";
import Sidebar from "@/components/Sidebar";
import AnnouncementBanner from "@/components/AnnouncementBanner";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const db = await readDB();
  const company = getCompany(db, me.companyId);
  const division = getDivision(db, me.divisionId);
  const department = getDepartment(db, me.departmentId);

  // ด้านบนทุกหน้า: บริษัท / ฝ่าย
  const headerSub = [company?.name, division?.name].filter(Boolean).join("  /  ");

  // มุมซ้ายล่าง: EMP ID, ตำแหน่ง, แผนก (ชื่อแสดงแยกด้านบน)
  const footerSub = [me.empId, me.position, department?.name ?? division?.name]
    .filter(Boolean)
    .join(" · ");

  const announcement = me.companyId ? latestAnnouncement(db, me.companyId) : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        companyName={company?.name ?? "ทุกบริษัท"}
        sections={buildNav(me)}
        footer={{ name: me.name, sub: footerSub || roleLabel(me.role) }}
        logout={logoutAction}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {announcement && <AnnouncementBanner id={announcement.id} message={announcement.message} />}

        <header className="border-b border-[var(--border)] px-8 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-brand-900">สวัสดี คุณ {me.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {headerSub || roleLabel(me.role)}
          </p>
        </header>

        <main className="flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}

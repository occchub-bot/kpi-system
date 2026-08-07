import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readDB } from "@/lib/store";
import YearSelect from "@/components/YearSelect";
import MemberScoreTable, { type MemberRow } from "@/components/MemberScoreTable";
import PaginatedTable from "@/components/PaginatedTable";
import {
  PageTitle,
  Section,
  Stat,
  Score,
  Empty,
  BarChart,
  Card,
  Th,
  Td,
  Tr,
} from "@/components/ui";
import {
  yearsOf,
  divisionsOf,
  departmentsOf,
  departmentsInDivision,
  activeUsersOf,
  activeUsersInDepartment,
  activeUsersInDivision,
  getDivision,
  getDepartment,
  getUser,
  userScoreInYear,
  companyAvgYear,
  divisionAvgYear,
  departmentAvgYear,
  kpisOf,
  bellCurve,
  orgScoresForYear,
} from "@/lib/queries";
import type { DB } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "employee") redirect("/me");
  if (me.role === "admin") redirect("/admin");
  if (!me.companyId) redirect("/login");

  const db = await readDB();
  const sp = await searchParams;
  const years = yearsOf(db, me.companyId);
  if (years.length === 0) {
    return <Empty>ยังไม่มีรอบประเมิน</Empty>;
  }
  const year = (sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0]);

  const selector = <YearSelect years={years} value={year} />;

  // Bell curve คิดจากคะแนนเฉลี่ยรายปีของพนักงาน active ทั้งองค์กรเสมอ ไม่ว่าจะดูจากมุมมองไหน
  const orgBellCurve = (
    <Section title="Bell Curve · กระจายตัวคะแนนทั้งองค์กร">
      <Card className="px-6 py-6">
        <BarChart data={bellCurve(orgScoresForYear(db, me.companyId, year))} />
      </Card>
    </Section>
  );

  /* ---------- ผจก.แผนก: พนักงานในแผนก ---------- */
  if (me.role === "dept_manager" && me.departmentId) {
    const dept = getDepartment(db, me.departmentId);
    // ไม่นับบัญชี HR เป็น "พนักงาน" (เป็นบัญชีกลาง ไม่ได้ถูกประเมิน)
    const members = activeUsersInDepartment(db, me.departmentId).filter((u) => u.role !== "hr");
    const evaluatedCount = members.filter(
      (m) => userScoreInYear(db, m.id, me.companyId!, year) !== null
    ).length;
    return (
      <div>
        <PageTitle right={selector}>Dashboard แผนก</PageTitle>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="แผนก" value={<span className="text-base">{dept?.name}</span>} />
          <Stat label="จำนวนพนักงาน" value={members.length} />
          <Stat label="จำนวนพนักงานที่ได้รับการประเมินแล้ว" value={evaluatedCount} />
        </div>

        {orgBellCurve}

        <Section title="พนักงานในแผนก">
          <MembersTable db={db} userIds={members.map((m) => m.id)} companyId={me.companyId} year={year} />
        </Section>
      </div>
    );
  }

  /* ---------- ผู้บริหารฝ่าย: AVG ฝ่าย + ทุกแผนก ---------- */
  if (me.role === "division_head" && me.divisionId) {
    const div = getDivision(db, me.divisionId);
    const depts = departmentsInDivision(db, me.divisionId);
    // ไม่นับบัญชี HR เป็น "พนักงาน" (เป็นบัญชีกลาง ไม่ได้ถูกประเมิน)
    const members = activeUsersInDivision(db, me.divisionId).filter((u) => u.role !== "hr");
    const deptAvgData = depts.map((d) => ({
      label: d.name,
      count: Math.round(departmentAvgYear(db, d.id, me.companyId!, year) ?? 0),
    }));
    return (
      <div>
        <PageTitle right={selector}>Dashboard ฝ่าย</PageTitle>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="ฝ่าย" value={<span className="text-base">{div?.name}</span>} />
          <Stat label="จำนวนแผนก" value={depts.length} />
          <Stat label="จำนวนพนักงาน" value={members.length} />
        </div>

        {orgBellCurve}

        <Section title="แผนกที่รับผิดชอบ">
          {depts.length === 0 ? (
            <Empty>ยังไม่มีแผนกในฝ่ายนี้</Empty>
          ) : (
            <PaginatedTable
              head={
                <>
                  <Th>แผนก</Th>
                  <Th>จำนวนพนักงาน</Th>
                  <Th className="text-right">คะแนนเฉลี่ย</Th>
                </>
              }
              rows={depts.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium">{d.name}</Td>
                  <Td>{activeUsersInDepartment(db, d.id).filter((u) => u.role !== "hr").length}</Td>
                  <Td className="text-right">
                    <Score value={departmentAvgYear(db, d.id, me.companyId!, year)} />
                  </Td>
                </Tr>
              ))}
            />
          )}
        </Section>

        {depts.length > 0 && (
          <Section title="คะแนนเฉลี่ยรายแผนกในฝ่าย">
            <Card className="px-6 py-6">
              <BarChart data={deptAvgData} />
            </Card>
          </Section>
        )}

        <Section title="รายบุคคล">
          <MembersTable db={db} userIds={members.map((m) => m.id)} companyId={me.companyId} year={year} showDept />
        </Section>
      </div>
    );
  }

  /* ---------- HR / CEO: ภาพรวมองค์กร ---------- */
  const divisions = divisionsOf(db, me.companyId);
  const departments = departmentsOf(db, me.companyId);
  // ไม่นับบัญชี HR เป็น "พนักงาน" (เป็นบัญชีกลาง ไม่ได้ถูกประเมิน) — ยกเว้นตัวเองถ้าผู้ดู dashboard คือ HR
  const allActive = activeUsersOf(db, me.companyId).filter((u) => u.role !== "hr" || u.id === me.id);
  const avg = companyAvgYear(db, me.companyId, year);
  const orgKpis = kpisOf(db, me.companyId, "org");

  return (
    <div>
      <PageTitle right={selector}>Dashboard องค์กร</PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="จำนวนพนักงาน" value={allActive.length} />
        <Stat label="จำนวนฝ่าย" value={divisions.length} />
        <Stat label="จำนวนแผนก" value={departments.length} />
        <Stat label="คะแนนเฉลี่ยองค์กร" value={<Score value={avg} />} />
      </div>

      <Section title="KPI องค์กร">
        {orgKpis.length === 0 ? (
          <Empty>ยังไม่มี KPI องค์กร</Empty>
        ) : (
          <Card className="divide-y divide-[var(--border)]">
            {orgKpis.map((k) => (
              <div key={k.id} className="px-5 py-3 text-sm">
                {k.title}
              </div>
            ))}
          </Card>
        )}
      </Section>

      {orgBellCurve}

      <Section title="รายชื่อฝ่าย">
        {divisions.length === 0 ? (
          <Empty>ยังไม่มีฝ่าย</Empty>
        ) : (
          <PaginatedTable
            head={
              <>
                <Th>ฝ่าย</Th>
                <Th>จำนวนแผนก</Th>
                <Th>จำนวนพนักงาน</Th>
                <Th className="text-right">คะแนนเฉลี่ย</Th>
              </>
            }
            rows={divisions.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium">{d.name}</Td>
                <Td>{departmentsInDivision(db, d.id).length}</Td>
                <Td>{activeUsersInDivision(db, d.id).length}</Td>
                <Td className="text-right">
                  <Score value={divisionAvgYear(db, d.id, me.companyId!, year)} />
                </Td>
              </Tr>
            ))}
          />
        )}
      </Section>

      <Section title="รายชื่อแผนก">
        {departments.length === 0 ? (
          <Empty>ยังไม่มีแผนก</Empty>
        ) : (
          <PaginatedTable
            head={
              <>
                <Th>แผนก</Th>
                <Th>ฝ่าย</Th>
                <Th>จำนวนพนักงาน</Th>
                <Th className="text-right">คะแนนเฉลี่ย</Th>
              </>
            }
            rows={departments.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium">{d.name}</Td>
                <Td className="text-neutral-500">{getDivision(db, d.divisionId)?.name ?? "—"}</Td>
                <Td>{activeUsersInDepartment(db, d.id).length}</Td>
                <Td className="text-right">
                  <Score value={departmentAvgYear(db, d.id, me.companyId!, year)} />
                </Td>
              </Tr>
            ))}
          />
        )}
      </Section>

      <Section title="คะแนนรายบุคคล">
        <MembersTable db={db} userIds={allActive.map((m) => m.id)} companyId={me.companyId} year={year} showDept />
      </Section>
    </div>
  );
}

/* ตารางสมาชิก + คะแนนเฉลี่ยรายปี (ค้นหา/กรองได้) */
function MembersTable({
  db,
  userIds,
  companyId,
  year,
  showDept = false,
}: {
  db: DB;
  userIds: string[];
  companyId: string;
  year: number;
  showDept?: boolean;
}) {
  if (userIds.length === 0) return <Empty>ไม่มีพนักงาน</Empty>;
  const rows: MemberRow[] = userIds
    .map((id) => getUser(db, id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({
      id: u.id,
      name: u.name,
      empId: u.empId,
      position: u.position,
      role: u.role,
      deptName: getDepartment(db, u.departmentId)?.name ?? "—",
      finalScore: userScoreInYear(db, u.id, companyId, year),
    }));
  return <MemberScoreTable rows={rows} showDept={showDept} />;
}

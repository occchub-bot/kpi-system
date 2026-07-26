import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addHRAction } from "@/lib/actions";
import { roleLabel, roleTone } from "@/lib/nav";
import { readDB } from "@/lib/store";
import { PageTitle, Section, Stat, Card, Field, Input, Button, Th, Td, Tr, Score, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import EmployeeAdminTable, { type EmpRow } from "@/components/EmployeeAdminTable";
import CopyPasswordButton from "@/components/CopyPasswordButton";
import {
  getCompany,
  usersOf,
  divisionsOf,
  departmentsOf,
  activeCycle,
  companyAvg,
  departmentAvg,
  divisionAvg,
  departmentsInDivision,
  getDivision,
  getDepartment,
  userName,
  usersInDepartment,
  usersInDivision,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompanyDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const { id } = await params;
  const db = await readDB();
  const company = getCompany(db, id);
  if (!company) notFound();

  const users = usersOf(db, id);
  const divisions = divisionsOf(db, id);
  const departments = departmentsOf(db, id);
  const hrs = users.filter((u) => u.role === "hr");
  const cycle = activeCycle(db, id);

  const empRows: EmpRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    position: u.position,
    empId: u.empId,
    email: u.email,
    phone: u.phone,
    role: u.role,
    roleLabel: roleLabel(u.role),
    roleTone: roleTone(u.role),
    divisionId: u.divisionId,
    departmentId: u.departmentId,
    managerId: u.managerId,
    deptName: getDepartment(db, u.departmentId)?.name ?? getDivision(db, u.divisionId)?.name ?? "—",
    managerName: userName(db, u.managerId),
    isActive: u.isActive !== false,
  }));

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-sm text-neutral-500 hover:text-neutral-900">
        ← กลับไปบริษัททั้งหมด
      </Link>
      <PageTitle>{company.name}</PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="พนักงาน" value={users.length} />
        <Stat label="ฝ่าย" value={divisions.length} />
        <Stat label="แผนก" value={departments.length} />
        <Stat label="KPI เฉลี่ย" value={<Score value={cycle ? companyAvg(db, id, cycle.id) : null} />} />
      </div>

      <Section title="เพิ่มอีเมล HR">
        <Card className="p-5">
          <form action={addHRAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="company_id" value={id} />
            <div className="flex-1 min-w-56"><Field label="อีเมล HR"><Input name="email" type="email" required /></Field></div>
            <Button>เพิ่ม HR</Button>
          </form>
          <p className="mt-2 text-xs text-neutral-400">HR เป็นบัญชีกลาง — ใครใช้อีเมลนี้ก็เข้าได้</p>
        </Card>
      </Section>

      <Section title="HR ของบริษัท">
        {hrs.length === 0 ? (
          <Empty>ยังไม่มี HR</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>อีเมล HR</Th><Th className="text-right">จัดการ</Th></>}
            rows={hrs.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium">{u.email}</Td>
                <Td className="text-right">
                  <CopyPasswordButton
                    userId={u.id}
                    className="text-xs text-neutral-500 underline hover:text-brand-800"
                  />
                </Td>
              </Tr>
            ))}
          />
        )}
      </Section>

      <Section title="คะแนนเฉลี่ยรายฝ่าย">
        {divisions.length === 0 ? (
          <Empty>ยังไม่มีฝ่าย</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>ฝ่าย</Th><Th>จำนวนแผนก</Th><Th>จำนวนพนักงาน</Th><Th className="text-right">AVG</Th></>}
            rows={divisions.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium">{d.name}</Td>
                <Td>{departmentsInDivision(db, d.id).length}</Td>
                <Td>{usersInDivision(db, d.id).length}</Td>
                <Td className="text-right"><Score value={cycle ? divisionAvg(db, d.id, cycle.id) : null} /></Td>
              </Tr>
            ))}
          />
        )}
      </Section>

      <Section title="คะแนนเฉลี่ยรายแผนก">
        {departments.length === 0 ? (
          <Empty>ยังไม่มีแผนก</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>แผนก</Th><Th>ฝ่าย</Th><Th>จำนวน</Th><Th className="text-right">AVG</Th></>}
            rows={departments.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium">{d.name}</Td>
                <Td className="text-neutral-500">{getDivision(db, d.divisionId)?.name}</Td>
                <Td>{usersInDepartment(db, d.id).length}</Td>
                <Td className="text-right"><Score value={cycle ? departmentAvg(db, d.id, cycle.id) : null} /></Td>
              </Tr>
            ))}
          />
        )}
      </Section>

      <Section title="พนักงานทั้งหมด">
        <EmployeeAdminTable rows={empRows} showManager={false} />
      </Section>
    </div>
  );
}

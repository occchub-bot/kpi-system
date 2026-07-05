import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addCompanyAction } from "@/lib/actions";
import { readDB } from "@/lib/store";
import { PageTitle, Section, Card, Field, Input, Button, Th, Td, Tr, Score, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import {
  companies,
  usersOf,
  divisionsOf,
  departmentsOf,
  activeCycle,
  companyAvg,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const db = await readDB();
  const list = companies(db);

  return (
    <div>
      <PageTitle>บริษัททั้งหมด</PageTitle>

      <Section title="เพิ่มบริษัท">
        <Card className="p-5">
          <form action={addCompanyAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อบริษัท"><Input name="name" placeholder="เช่น บริษัท ก จำกัด" required /></Field>
            <Field label="อีเมล HR"><Input name="hr_email" type="email" placeholder="hr@company.com" required /></Field>
            <div className="sm:col-span-2"><Button>เพิ่มบริษัท + HR</Button></div>
          </form>
        </Card>
      </Section>

      <Section title="รายชื่อบริษัท">
        {list.length === 0 ? (
          <Empty>ยังไม่มีบริษัท</Empty>
        ) : (
          <PaginatedTable
            head={
              <>
                <Th>บริษัท</Th>
                <Th>พนักงาน</Th>
                <Th>ฝ่าย</Th>
                <Th>แผนก</Th>
                <Th className="text-right">KPI เฉลี่ย</Th>
                <Th></Th>
              </>
            }
            rows={list.map((c) => {
              const cycle = activeCycle(db, c.id);
              return (
                <Tr key={c.id}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td>{usersOf(db, c.id).length}</Td>
                  <Td>{divisionsOf(db, c.id).length}</Td>
                  <Td>{departmentsOf(db, c.id).length}</Td>
                  <Td className="text-right">
                    <Score value={cycle ? companyAvg(db, c.id, cycle.id) : null} />
                  </Td>
                  <Td className="text-right">
                    <Link href={`/admin/company/${c.id}`} className="text-sm font-medium underline">
                      จัดการ
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          />
        )}
      </Section>
    </div>
  );
}

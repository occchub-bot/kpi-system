import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addDepartmentAction, deleteDepartmentAction, updateDepartmentAction } from "@/lib/actions";
import { PageTitle, Section, Card, Field, Input, Select, Button, Th, Td, Tr, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import { readDB } from "@/lib/store";
import { divisionsOf, departmentsOf, usersInDepartment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "hr" || !me.companyId) redirect("/");

  const db = await readDB();
  const divisions = divisionsOf(db, me.companyId);
  const departments = departmentsOf(db, me.companyId);

  return (
    <div className="max-w-3xl">
      <PageTitle>แผนก</PageTitle>

      <Section title="เพิ่มแผนกใหม่">
        <Card className="p-5">
          {divisions.length === 0 ? (
            <p className="text-sm text-neutral-500">กรุณาเพิ่มฝ่ายก่อน</p>
          ) : (
            <form action={addDepartmentAction} className="flex items-end gap-3">
              <div className="w-56">
                <Field label="ฝ่าย">
                  <Select name="division_id" required>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex-1">
                <Field label="ชื่อแผนก">
                  <Input name="name" placeholder="เช่น แผนกการเงิน" required />
                </Field>
              </div>
              <Button>เพิ่มแผนก</Button>
            </form>
          )}
        </Card>
      </Section>

      <Section title="แผนกทั้งหมด">
        {departments.length === 0 ? (
          <Empty>ยังไม่มีแผนก</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>แผนก / ฝ่าย</Th><Th>จำนวนพนักงาน</Th><Th className="text-right">จัดการ</Th></>}
            rows={departments.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <form action={updateDepartmentAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <Input name="name" defaultValue={d.name} className="max-w-48" />
                    <Select name="division_id" defaultValue={d.divisionId} className="max-w-48">
                      {divisions.map((dv) => (
                        <option key={dv.id} value={dv.id}>{dv.name}</option>
                      ))}
                    </Select>
                    <Button variant="outline" className="shrink-0 px-3 py-1.5 text-xs">บันทึก</Button>
                  </form>
                </Td>
                <Td>{usersInDepartment(db, d.id).length}</Td>
                <Td className="text-right">
                  <form action={deleteDepartmentAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      ลบ
                    </Button>
                  </form>
                </Td>
              </Tr>
            ))}
          />
        )}
      </Section>
    </div>
  );
}

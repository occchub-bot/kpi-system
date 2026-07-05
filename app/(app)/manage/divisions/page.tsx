import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addDivisionAction, deleteDivisionAction, updateDivisionAction } from "@/lib/actions";
import { PageTitle, Section, Card, Field, Input, Button, Th, Td, Tr, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import { readDB } from "@/lib/store";
import { divisionsOf, departmentsInDivision } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DivisionsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "hr" || !me.companyId) redirect("/");

  const db = await readDB();
  const divisions = divisionsOf(db, me.companyId);

  return (
    <div className="max-w-3xl">
      <PageTitle>ฝ่าย</PageTitle>

      <Section title="เพิ่มฝ่ายใหม่">
        <Card className="p-5">
          <form action={addDivisionAction} className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="ชื่อฝ่าย">
                <Input name="name" placeholder="เช่น ฝ่ายบริหาร" required />
              </Field>
            </div>
            <Button>เพิ่มฝ่าย</Button>
          </form>
        </Card>
      </Section>

      <Section title="ฝ่ายทั้งหมด">
        {divisions.length === 0 ? (
          <Empty>ยังไม่มีฝ่าย</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>ฝ่าย</Th><Th>จำนวนแผนก</Th><Th className="text-right">จัดการ</Th></>}
            rows={divisions.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <form action={updateDivisionAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <Input name="name" defaultValue={d.name} className="max-w-56" />
                    <Button variant="outline" className="shrink-0 px-3 py-1.5 text-xs">บันทึก</Button>
                  </form>
                </Td>
                <Td>{departmentsInDivision(db, d.id).length}</Td>
                <Td className="text-right">
                  <form action={deleteDivisionAction}>
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

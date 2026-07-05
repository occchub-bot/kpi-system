import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addCycleAction } from "@/lib/actions";
import { PageTitle, Section, Card, Field, Input, Button, Th, Td, Tr, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import { readDB } from "@/lib/store";
import { cyclesOf } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "hr" || !me.companyId) redirect("/");

  const db = await readDB();
  const cycles = cyclesOf(db, me.companyId);

  return (
    <div className="max-w-3xl">
      <PageTitle>รอบประเมิน</PageTitle>

      <Section title="สร้างรอบประเมินใหม่">
        <Card className="p-5">
          <form action={addCycleAction} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <Field label="ชื่อรอบ"><Input name="name" placeholder="เช่น รอบ 1/2568" required /></Field>
            </div>
            <div className="w-28">
              <Field label="ปี (พ.ศ.)"><Input name="year" type="number" placeholder="2568" /></Field>
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-brand-700" />
              ตั้งเป็นรอบปัจจุบัน
            </label>
            <Button>สร้างรอบ</Button>
          </form>
        </Card>
      </Section>

      <Section title="รอบประเมินทั้งหมด">
        {cycles.length === 0 ? (
          <Empty>ยังไม่มีรอบประเมิน</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>ชื่อรอบ</Th><Th>ปี</Th><Th>สถานะ</Th></>}
            rows={cycles.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.year}</Td>
                <Td>
                  {c.active ? (
                    <span className="rounded-full bg-brand-800 px-2.5 py-0.5 text-xs font-medium text-white">รอบปัจจุบัน</span>
                  ) : (
                    <span className="text-xs text-neutral-400">ปิด</span>
                  )}
                </Td>
              </Tr>
            ))}
          />
        )}
      </Section>
    </div>
  );
}

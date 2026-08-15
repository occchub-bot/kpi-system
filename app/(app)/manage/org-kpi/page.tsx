import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addOrgKpiAction, deleteKpiAction } from "@/lib/actions";
import { PageTitle, Section, Card, Field, Input, Button, SubmitButton, Empty } from "@/components/ui";
import { readDB } from "@/lib/store";
import { kpisOf } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OrgKpiPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "hr" || !me.companyId) redirect("/");

  const db = await readDB();
  const kpis = kpisOf(db, me.companyId, "org");

  return (
    <div className="max-w-3xl">
      <PageTitle>KPI องค์กร</PageTitle>
      <p className="mb-5 -mt-3 text-sm text-neutral-500">
        KPI หลักขององค์กร — ใส่เฉพาะหัวข้อ (ไม่มีน้ำหนักงาน(weight)/เวลา) ใช้เป็นตัวให้ฝ่ายเชื่อมต่อ
      </p>

      <Section title="เพิ่ม KPI องค์กร">
        <Card className="p-5">
          <form action={addOrgKpiAction} className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="หัวข้อ KPI">
                <Input name="title" placeholder="เช่น เติบโตของรายได้องค์กร 15%" required />
              </Field>
            </div>
            <Button>เพิ่ม</Button>
          </form>
        </Card>
      </Section>

      <Section title="KPI องค์กรทั้งหมด">
        {kpis.length === 0 ? (
          <Empty>ยังไม่มี KPI องค์กร</Empty>
        ) : (
          <Card className="divide-y divide-[var(--border)]">
            {kpis.map((k, i) => (
              <div key={k.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                <span className="text-neutral-400 tabular-nums">{i + 1}.</span>
                <span className="flex-1 font-medium">{k.title}</span>
                <form action={deleteKpiAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <SubmitButton className="text-xs text-red-600 underline hover:text-red-800">
                    ลบ
                  </SubmitButton>
                </form>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

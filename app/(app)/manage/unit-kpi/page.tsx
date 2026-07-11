import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addUnitKpiAction } from "@/lib/actions";
import { readDB } from "@/lib/store";
import { PageTitle, Section, Card, Field, Input, Select, Button, Th, Td, Tr, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import {
  kpisOf,
  divisionKpis,
  departmentKpis,
  getKpi,
  getDivision,
  getDepartment,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function UnitKpiPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.companyId) redirect("/");

  const isDiv = me.role === "division_head" && me.divisionId;
  const isDept = me.role === "dept_manager" && me.departmentId;
  if (!isDiv && !isDept) redirect("/manage");

  const db = await readDB();
  const title = isDiv ? "KPI ฝ่าย" : "KPI แผนก";
  const parentLabel = isDiv ? "เชื่อมกับ KPI องค์กร" : "เชื่อมกับ KPI ฝ่าย";
  const unitName = isDiv ? getDivision(db, me.divisionId)?.name : getDepartment(db, me.departmentId)?.name;

  // ตัวเลือก parent
  const parents = isDiv
    ? kpisOf(db, me.companyId, "org")
    : me.divisionId
      ? divisionKpis(db, me.divisionId)
      : [];

  // รายการ KPI ของหน่วยงานนี้
  const list = isDiv
    ? divisionKpis(db, me.divisionId!)
    : departmentKpis(db, me.departmentId!);

  return (
    <div className="max-w-3xl">
      <PageTitle>{title}</PageTitle>
      <p className="mb-5 -mt-3 text-sm text-neutral-500">
        {unitName} — ใส่เฉพาะหัวข้อ และเลือกเชื่อมกับ KPI ระดับบน (ไม่มีน้ำหนัก/เวลา)
      </p>

      <Section title={`เพิ่ม ${title}`}>
        <Card className="p-5">
          <form action={addUnitKpiAction} className="space-y-3">
            <Field label="หัวข้อ KPI">
              <Input name="title" placeholder="เช่น สรรหาพนักงานตามแผน" required />
            </Field>
            <Field label={parentLabel}>
              <Select name="parent_kpi_id" defaultValue="">
                <option value="">— ไม่เชื่อม —</option>
                {parents.map((k) => (
                  <option key={k.id} value={k.id}>{k.title}</option>
                ))}
              </Select>
            </Field>
            <Button>เพิ่ม {title}</Button>
          </form>
        </Card>
      </Section>

      <Section title={`${title}ทั้งหมด`}>
        {list.length === 0 ? (
          <Empty>ยังไม่มี {title}</Empty>
        ) : (
          <PaginatedTable
            head={<><Th>หัวข้อ KPI</Th><Th>{parentLabel}</Th></>}
            rows={list.map((k) => (
              <Tr key={k.id}>
                <Td className="font-medium">{k.title}</Td>
                <Td className="text-neutral-500">{getKpi(db, k.parentKpiId)?.title ?? "—"}</Td>
              </Tr>
            ))}
          />
        )}
      </Section>
    </div>
  );
}

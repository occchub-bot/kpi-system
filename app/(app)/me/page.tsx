import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CycleSelect from "@/components/CycleSelect";
import {
  PageTitle,
  Section,
  Stat,
  Th,
  Td,
  Tr,
  Score,
  Empty,
  LinkButton,
} from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import { kpiLevelLabel } from "@/lib/nav";
import { readDB } from "@/lib/store";
import {
  activeCycle,
  cyclesOf,
  getCycle,
  assessmentOf,
  userName,
  getKpi,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MyDashboard({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.companyId) redirect("/admin"); // มีแค่ admin เท่านั้นที่ไม่มี companyId — หน้านี้ใช้ไม่ได้กับ admin

  const db = await readDB();
  const sp = await searchParams;
  const cycleList = cyclesOf(db, me.companyId);
  const cycle = (sp.cycle && getCycle(db, sp.cycle)) || activeCycle(db, me.companyId);
  if (!cycle) return <Empty>ยังไม่มีรอบประเมิน</Empty>;

  const a = assessmentOf(db, me.id, cycle.id);
  const linkLabel = kpiLevelLabel(me.role);

  return (
    <div>
      <PageTitle
        right={
          <CycleSelect cycles={cycleList.map((c) => ({ id: c.id, name: c.name }))} value={cycle.id} />
        }
      >
        Dashboard ของตนเอง
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <Stat label="AVG คะแนนของรอบประเมินนี้" value={<Score value={a?.finalScore ?? null} />} />
        <Stat label="ผู้บังคับบัญชาผู้ประเมิน" value={<span className="text-base">{userName(db, me.managerId)}</span>} />
      </div>

      <Section title="รายการ KPI ของตนเอง">
        {!a || a.items.length === 0 ? (
          <Empty>
            <div className="space-y-3">
              <p>ยังไม่ได้ทำการประเมินตนเองในรอบนี้</p>
              <LinkButton href="/me/kpi">ไปทำ KPI ของตนเอง</LinkButton>
            </div>
          </Empty>
        ) : (
          <PaginatedTable
            head={
              <>
                <Th>หัวข้อ KPI</Th>
                <Th>{linkLabel}</Th>
                <Th>ตัวชี้วัด</Th>
                <Th>Weight</Th>
                <Th className="text-right">ผู้บังคับบัญชา</Th>
              </>
            }
            rows={a.items.map((it) => (
              <Tr key={it.id}>
                <Td className="font-medium">
                  {it.title || "—"}
                  {it.selfComment && (
                    <span className="mt-0.5 block text-xs font-normal text-neutral-400">Note: {it.selfComment}</span>
                  )}
                </Td>
                <Td className="text-neutral-500">{getKpi(db, it.linkedKpiId)?.title ?? "—"}</Td>
                <Td className="text-neutral-500">{it.target || "—"}</Td>
                <Td>{it.weight}%</Td>
                <Td className="text-right">
                  <Score value={it.evalScore} />
                  {it.evalComment && (
                    <span className="mt-0.5 block text-xs font-normal text-neutral-400">{it.evalComment}</span>
                  )}
                </Td>
              </Tr>
            ))}
          />
        )}
      </Section>

      {a?.remark && (
        <Section title="Remark">
          <div className="rounded-xl border border-[var(--border)] bg-white px-5 py-4 text-sm text-neutral-700">
            {a.remark}
          </div>
        </Section>
      )}
    </div>
  );
}

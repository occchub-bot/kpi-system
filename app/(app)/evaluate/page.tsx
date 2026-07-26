import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CycleSelect from "@/components/CycleSelect";
import { PageTitle, Th, Td, Tr, Score, StatusTag, Badge, Empty, LinkButton } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import { readDB } from "@/lib/store";
import { roleLabel, roleTone } from "@/lib/nav";
import {
  activeCycle,
  cyclesOf,
  getCycle,
  subordinatesOf,
  assessmentOf,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EvaluatePage({
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

  const subs = subordinatesOf(db, me.id);

  return (
    <div>
      <PageTitle
        right={
          <CycleSelect cycles={cycleList.map((c) => ({ id: c.id, name: c.name }))} value={cycle.id} />
        }
      >
        ประเมินผู้ใต้บังคับบัญชา
      </PageTitle>

      {subs.length === 0 ? (
        <Empty>ไม่มีผู้ใต้บังคับบัญชาที่ต้องประเมิน</Empty>
      ) : (
        <PaginatedTable
          head={
            <>
              <Th>ชื่อ</Th>
              <Th>ตำแหน่ง</Th>
              <Th>บทบาท</Th>
              <Th>สถานะการส่ง</Th>
              <Th className="text-right">Final Score</Th>
              <Th></Th>
            </>
          }
          rows={subs.map((u) => {
            const a = assessmentOf(db, u.id, cycle.id);
            const canEval = a && (a.status === "submitted" || a.status === "evaluated");
            return (
              <Tr key={u.id}>
                <Td className="font-semibold">{u.name}</Td>
                <Td>{u.position}</Td>
                <Td><Badge tone={roleTone(u.role)}>{roleLabel(u.role)}</Badge></Td>
                <Td>{a ? <StatusTag status={a.status} /> : <span className="text-neutral-400">ยังไม่ส่ง</span>}</Td>
                <Td className="text-right"><Score value={a?.finalScore ?? null} /></Td>
                <Td className="text-right">
                  {canEval ? (
                    <LinkButton href={`/evaluate/${a!.id}`} variant="outline">
                      {a!.status === "evaluated" ? "แก้ไขผล" : "ประเมิน"}
                    </LinkButton>
                  ) : (
                    <span className="text-xs text-neutral-400">รอส่ง</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        />
      )}
    </div>
  );
}

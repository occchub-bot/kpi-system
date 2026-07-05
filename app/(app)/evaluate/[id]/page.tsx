import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import EvaluationForm from "@/components/EvaluationForm";
import { PageTitle } from "@/components/ui";
import { readDB } from "@/lib/store";
import { getUser, getKpi, getCycle } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EvaluateDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;

  const db = await readDB();
  const a = db.assessments.find((x) => x.id === id);
  if (!a) notFound();

  const owner = getUser(db, a.userId);
  // สิทธิ์: ต้องเป็นหัวหน้าของเจ้าของรายการ
  if (!owner || owner.managerId !== me.id) redirect("/evaluate");

  const cycle = getCycle(db, a.cycleId);
  const levelLabel = { org: "KPI องค์กร", division: "KPI ฝ่าย", department: "KPI แผนก" } as const;
  const items = a.items.map((it) => {
    const linked = getKpi(db, it.linkedKpiId);
    return {
    id: it.id,
    title: it.title,
    weight: it.weight,
    target: it.target,
    linkedLabel: linked ? levelLabel[linked.level] : "เชื่อมกับ",
    linkedTitle: linked?.title ?? "—",
    selfScore: it.selfScore,
    selfComment: it.selfComment,
    evalScore: it.evalScore,
    evalComment: it.evalComment,
    };
  });

  return (
    <div className="max-w-3xl">
      <Link href="/evaluate" className="mb-4 inline-block text-sm text-neutral-500 hover:text-neutral-900">
        ← กลับไปรายการประเมิน
      </Link>
      <PageTitle>ประเมิน: {owner.name}</PageTitle>
      <p className="mb-5 -mt-3 text-sm text-neutral-500">
        {owner.position} · {owner.empId} · รอบ {cycle?.name}
      </p>

      <EvaluationForm assessmentId={a.id} items={items} />
    </div>
  );
}

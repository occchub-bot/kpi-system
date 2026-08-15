"use client";

import { useState } from "react";
import { saveEvaluationAction } from "@/lib/actions";
import { SubmitButton } from "@/components/ui";

interface ItemView {
  id: string;
  title: string;
  weight: number;
  target: string;
  linkedLabel: string;
  linkedTitle: string;
  selfScore: number;
  selfComment: string;
  evalScore: number | null;
  evalComment: string;
}

export default function EvaluationForm({
  assessmentId,
  items,
}: {
  assessmentId: string;
  items: ItemView[];
}) {
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>(
    Object.fromEntries(
      items.map((it) => [it.id, { score: it.evalScore ?? it.selfScore, comment: it.evalComment }])
    )
  );

  const set = (id: string, patch: Partial<{ score: number; comment: string }>) =>
    setScores((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const totalW = items.reduce((s, i) => s + (i.weight || 0), 0);
  const preview =
    totalW > 0
      ? Math.round(
          (items.reduce((s, i) => s + (i.weight || 0) * (scores[i.id]?.score ?? 0), 0) / totalW) * 10
        ) / 10
      : 0;

  const inputCls =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

  return (
    <form action={saveEvaluationAction} className="space-y-4">
      <input type="hidden" name="assessment_id" value={assessmentId} />
      <input type="hidden" name="scores" value={JSON.stringify(scores)} />

      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={it.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  <span className="text-neutral-400">#{idx + 1}</span> {it.title || "—"}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {it.linkedLabel}: {it.linkedTitle} · น้ำหนักงาน(weight) {it.weight}% · ตัวชี้วัด {it.target || "—"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-neutral-500">
                ประเมินตนเอง <span className="font-semibold text-neutral-900">{it.selfScore}</span>
              </span>
            </div>

            {it.selfComment && (
              <div className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                <span className="font-medium text-neutral-500">Note:</span> {it.selfComment}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">คะแนนผู้บังคับบัญชา (0–100)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={scores[it.id]?.score ?? 0}
                  onChange={(e) => set(it.id, { score: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">ความเห็น</span>
                <input
                  className={inputCls}
                  value={scores[it.id]?.comment ?? ""}
                  onChange={(e) => set(it.id, { comment: e.target.value })}
                  placeholder="ความเห็นเพิ่มเติม (ถ้ามี)"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-sm text-neutral-600">
          คะแนนสุดท้าย (ถ่วงน้ำหนัก):{" "}
          <span className="text-lg font-bold text-neutral-900">{preview.toFixed(1)}</span>
        </span>
        <SubmitButton className="rounded-lg bg-brand-800 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
          บันทึกผลประเมิน
        </SubmitButton>
      </div>
    </form>
  );
}

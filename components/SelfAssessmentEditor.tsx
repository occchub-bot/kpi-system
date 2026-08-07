"use client";

import { useState } from "react";
import { saveSelfAssessmentAction } from "@/lib/actions";
import { Modal, SubmitButton } from "@/components/ui";
import type { AssessmentStatus } from "@/lib/types";

interface Item {
  id: string;
  title: string;
  weight: number;
  target: string;
  linkedKpiId: string | null;
  selfScore: number;
  selfComment: string;
}
/** ฟอร์มร่างเพิ่ม KPI — เก็บตัวเลขเป็น string ระหว่างพิมพ์ เพื่อให้ลบเป็นช่องว่างแล้วพิมพ์ใหม่ได้ (ไม่ถูกดันกลับเป็น 0 ทันที) */
interface Draft {
  title: string;
  weight: string;
  target: string;
  linkedKpiId: string | null;
  selfScore: string;
  selfComment: string;
}
interface KpiOpt {
  id: string;
  title: string;
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

let seq = 0;
const uid = () => `it-${Date.now().toString(36)}-${seq++}`;

const emptyDraft = (): Draft => ({
  title: "",
  weight: "",
  target: "",
  linkedKpiId: null,
  selfScore: "",
  selfComment: "",
});

export default function SelfAssessmentEditor({
  cycleId,
  initial,
  initialRemark,
  linkable,
  linkLabel,
  status,
}: {
  cycleId: string;
  initial: Item[];
  initialRemark: string;
  linkable: KpiOpt[];
  linkLabel: string;
  status: AssessmentStatus;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [remark, setRemark] = useState(initialRemark);
  const [weightMsg, setWeightMsg] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const kpiTitle = (id: string | null) =>
    id ? linkable.find((k) => k.id === id)?.title ?? "—" : "—";

  const addItem = () => {
    const title = draft.title.trim();
    const target = draft.target.trim();
    const weight = draft.weight.trim() === "" ? NaN : Number(draft.weight);
    const selfScore = draft.selfScore.trim() === "" ? NaN : Number(draft.selfScore);

    if (!title) return;
    if (!target) {
      setAddError("กรุณากรอกตัวชี้วัด");
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      setAddError("น้ำหนักต้องมากกว่า 0 และไม่เกิน 100");
      return;
    }
    if (!Number.isFinite(selfScore) || selfScore < 0 || selfScore > 100) {
      setAddError("คะแนนประเมินตนเองต้องอยู่ระหว่าง 0–100");
      return;
    }
    setAddError(null);
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        title,
        weight,
        target,
        linkedKpiId: draft.linkedKpiId,
        selfScore,
        selfComment: draft.selfComment.trim(),
      },
    ]);
    setDraft(emptyDraft());
  };
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  if (status !== "draft") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[var(--border)] bg-neutral-50 px-5 py-4 text-sm text-neutral-600">
          {status === "evaluated"
            ? "การประเมินรอบนี้ ได้รับการประเมินโดยผู้บังคับบัญชาแล้ว — ไม่สามารถแก้ไขได้"
            : "ส่งข้อมูลนี้ให้ผู้บังคับบัญชาประเมินแล้ว — ไม่สามารถแก้ไขได้"}
        </div>
        <ItemList items={items} kpiTitle={kpiTitle} linkLabel={linkLabel} />
        {remark && (
          <div className="rounded-xl border border-[var(--border)] bg-white px-5 py-4 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">Remark:</span> {remark}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ฟอร์มเพิ่ม KPI */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-5">
        <p className="mb-3 text-sm font-semibold">เพิ่ม KPI</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{linkLabel}</span>
            <select
              className={inputCls}
              value={draft.linkedKpiId ?? ""}
              onChange={(e) => set({ linkedKpiId: e.target.value || null })}
            >
              <option value="">— ไม่เชื่อม —</option>
              {linkable.map((k) => (
                <option key={k.id} value={k.id}>{k.title}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">1. หัวข้อ KPI</span>
            <input
              className={inputCls}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="เช่น สรรหาพนักงานครบตามอัตรากำลัง"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">2. ตัวชี้วัด</span>
            <input
              className={inputCls}
              value={draft.target}
              onChange={(e) => set({ target: e.target.value })}
              placeholder="กำหนดเอง เช่น 100,000 บาท · 100% · ลดลง 30% จากปีที่แล้ว"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">3. น้ำหนัก (Weight %)</span>
            <input
              type="number" min={0} max={100} className={inputCls}
              value={draft.weight}
              onChange={(e) => set({ weight: e.target.value })}
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">4. คะแนนประเมินตนเอง (0–100)</span>
            <input
              type="number" min={0} max={100} className={inputCls}
              value={draft.selfScore}
              onChange={(e) => set({ selfScore: e.target.value })}
              placeholder="0"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">5. Note:</span>
            <textarea
              className={inputCls}
              rows={2}
              value={draft.selfComment}
              onChange={(e) => set({ selfComment: e.target.value })}
              placeholder="อธิบายผลงาน/บริบทเพิ่มเติมให้ผู้บังคับบัญชาทราบ"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          {addError && <span className="text-sm text-red-600">{addError}</span>}
          <button
            type="button"
            onClick={addItem}
            disabled={!draft.title.trim()}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            + เพิ่มลงรายการ
          </button>
        </div>
      </div>

      {/* รายการ KPI ที่เพิ่มแล้ว */}
      <div>
        <p className="mb-2 text-sm font-semibold">รายการ KPI ของตนเอง ({items.length})</p>
        <ItemList items={items} kpiTitle={kpiTitle} linkLabel={linkLabel} onRemove={remove} />
        <div className="mt-2 text-right">
          <span className={totalWeight === 100 ? "text-sm text-neutral-500" : "text-sm font-medium text-red-600"}>
            น้ำหนักรวม {totalWeight}%
            {totalWeight !== 100 && (totalWeight > 100 ? " (เกิน 100%)" : " (ยังไม่ครบ 100%)")}
          </span>
        </div>
      </div>

      {/* Remark รวม */}
      <div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Remark</span>
          <textarea
            className={inputCls}
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
          />
        </label>
      </div>

      {/* บันทึก/ส่ง */}
      <form action={saveSelfAssessmentAction} className="border-t border-[var(--border)] pt-4">
        <input type="hidden" name="cycle_id" value={cycleId} />
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <input type="hidden" name="remark" value={remark} />
        <div className="flex gap-2">
          <SubmitButton
            name="intent" value="save"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            บันทึกร่าง
          </SubmitButton>
          <SubmitButton
            name="intent" value="submit"
            disabled={items.length === 0}
            onClick={(e) => {
              if (totalWeight !== 100) {
                e.preventDefault();
                setWeightMsg(
                  totalWeight > 100
                    ? `น้ำหนักรวมทุกรายการตอนนี้ ${totalWeight}% ซึ่งเกิน 100% — กรุณาปรับน้ำหนักรวมให้เท่ากับ 100% พอดีก่อนส่ง`
                    : `น้ำหนักรวมทุกรายการตอนนี้ ${totalWeight}% ซึ่งยังไม่ครบ 100% — กรุณาปรับน้ำหนักรวมให้เท่ากับ 100% พอดีก่อนส่ง`
                );
              }
            }}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            ส่งให้ผู้บังคับบัญชาประเมิน
          </SubmitButton>
        </div>
      </form>

      <Modal open={weightMsg !== null} onClose={() => setWeightMsg(null)} title="น้ำหนักรวมทุกรายการต้องเท่ากับ 100%">
        {weightMsg}
      </Modal>
    </div>
  );
}

function ItemList({
  items,
  kpiTitle,
  linkLabel,
  onRemove,
}: {
  items: Item[];
  kpiTitle: (id: string | null) => string;
  linkLabel: string;
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white py-10 text-center text-sm text-neutral-400">
        ยังไม่มีรายการ — เพิ่ม KPI ด้านบน
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      {items.map((it, idx) => (
        <div
          key={it.id}
          className="flex items-start gap-4 border-b border-[var(--border)] px-5 py-4 last:border-0"
        >
          <span className="mt-0.5 text-sm tabular-nums text-neutral-400">{idx + 1}.</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{it.title}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {linkLabel}: {kpiTitle(it.linkedKpiId)} · น้ำหนัก {it.weight}% · ตัวชี้วัด {it.target || "—"}
            </p>
            {it.selfComment && (
              <p className="mt-1 text-xs text-neutral-600">Note: {it.selfComment}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-neutral-400">คะแนนตนเอง</p>
            <p className="font-semibold tabular-nums">{it.selfScore}</p>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(it.id)}
              className="shrink-0 text-xs text-neutral-400 underline hover:text-neutral-900"
            >
              ลบ
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

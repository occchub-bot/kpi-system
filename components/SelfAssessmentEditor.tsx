"use client";

import { useState } from "react";
import { saveSelfAssessmentAction } from "@/lib/actions";
import { Modal } from "@/components/ui";

interface Item {
  id: string;
  title: string;
  weight: number;
  target: string;
  linkedKpiId: string | null;
  selfScore: number;
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

const emptyDraft = (): Item => ({
  id: "",
  title: "",
  weight: 0,
  target: "",
  linkedKpiId: null,
  selfScore: 0,
  selfComment: "",
});

export default function SelfAssessmentEditor({
  cycleId,
  initial,
  initialRemark,
  linkable,
  linkLabel,
  locked,
}: {
  cycleId: string;
  initial: Item[];
  initialRemark: string;
  linkable: KpiOpt[];
  linkLabel: string;
  locked: boolean;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [draft, setDraft] = useState<Item>(emptyDraft());
  const [remark, setRemark] = useState(initialRemark);
  const [overWeightMsg, setOverWeightMsg] = useState<string | null>(null);

  const kpiTitle = (id: string | null) =>
    id ? linkable.find((k) => k.id === id)?.title ?? "—" : "—";

  const addItem = () => {
    if (!draft.title.trim()) return;
    const current = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
    const next = current + (Number(draft.weight) || 0);
    if (next > 100) {
      setOverWeightMsg(
        `น้ำหนักรวมจะกลายเป็น ${next}% ซึ่งเกิน 100% — กรุณาปรับน้ำหนักของรายการนี้ให้ไม่เกิน ${100 - current}%`
      );
      return;
    }
    setItems((prev) => [...prev, { ...draft, id: uid() }]);
    setDraft(emptyDraft());
  };
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const set = (patch: Partial<Item>) => setDraft((d) => ({ ...d, ...patch }));

  if (locked) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[var(--border)] bg-neutral-50 px-5 py-4 text-sm text-neutral-600">
          การประเมินรอบนี้ถูกประเมินโดยผู้บังคับบัญชาแล้ว — ไม่สามารถแก้ไขได้
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
              onChange={(e) => set({ weight: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">4. คะแนนประเมินตนเอง (0–100)</span>
            <input
              type="number" min={0} max={100} className={inputCls}
              value={draft.selfScore}
              onChange={(e) => set({ selfScore: Number(e.target.value) })}
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
        <div className="mt-3 flex justify-end">
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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">รายการ KPI ของตนเอง ({items.length})</p>
          <span className={totalWeight === 100 ? "text-sm text-neutral-500" : "text-sm font-medium text-neutral-900"}>
            น้ำหนักรวม {totalWeight}% {totalWeight !== 100 && "(ควรรวมได้ 100%)"}
          </span>
        </div>
        <ItemList items={items} kpiTitle={kpiTitle} linkLabel={linkLabel} onRemove={remove} />
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
          <button
            type="submit" name="intent" value="save"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            บันทึกร่าง
          </button>
          <button
            type="submit" name="intent" value="submit"
            disabled={items.length === 0 || totalWeight !== 100}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            ส่งให้ผู้บังคับบัญชาประเมิน
          </button>
        </div>
        {items.length > 0 && totalWeight !== 100 && (
          <p className="mt-2 text-xs text-amber-600">
            ต้องใส่น้ำหนักรวมให้ครบ 100% ก่อนจึงจะส่งได้ (ตอนนี้ {totalWeight}%)
          </p>
        )}
      </form>

      <Modal open={overWeightMsg !== null} onClose={() => setOverWeightMsg(null)} title="น้ำหนักเกิน 100%">
        {overWeightMsg}
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
            <p className="text-xs text-neutral-400">ตนเอง</p>
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

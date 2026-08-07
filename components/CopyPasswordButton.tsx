"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetPasswordAction } from "@/lib/actions";
import { Modal } from "@/components/ui";

/** สุ่มรหัสผ่านใหม่ให้ผู้ใช้ คัดลอกเข้าคลิปบอร์ดทันที และโชว์ modal ค้างไว้ให้ตรวจ/คัดลอกซ้ำได้ (ไม่ auto-dismiss แบบ toast) */
export default function CopyPasswordButton({ userId, className }: { userId: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const copyAgain = async () => {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.password);
      setCopied(true);
    } catch {
      // clipboard permission blocked — ผู้ใช้เลือกคัดลอกเองจากช่อง select-all ได้
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          startTransition(async () => {
            const fd = new FormData();
            fd.set("id", userId);
            const result = await resetPasswordAction(fd);
            if ("error" in result) {
              toast.error(result.error);
              return;
            }
            setCopied(false);
            setReveal(result);
            try {
              await navigator.clipboard.writeText(result.password);
              setCopied(true);
            } catch {
              // clipboard permission blocked — ยังโชว์ modal ให้คัดลอกเองได้
            }
          });
        }}
      >
        {pending ? "กำลังสุ่มรหัส…" : "คัดลอกรหัสผ่าน"}
      </button>

      <Modal open={reveal !== null} onClose={() => setReveal(null)} title="ตั้งรหัสผ่านใหม่แล้ว">
        {reveal && (
          <>
            <p className="mb-2">{reveal.email}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-base font-semibold tracking-wide text-neutral-900">
                {reveal.password}
              </code>
              <button
                type="button"
                onClick={copyAgain}
                className="shrink-0 rounded-lg bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-400">บันทึกรหัสผ่านนี้ไว้ตอนนี้เลย — จะไม่แสดงซ้ำอีก</p>
          </>
        )}
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";

/**
 * โชว์รหัสผ่านที่สุ่มไว้เป็น modal ค้างจนกว่าจะปิดเอง (ไม่ auto-dismiss แบบ toast)
 * แก้ปัญหา HR พลาดดูรหัสผ่านตอนเพิ่มผู้ใช้ใหม่ เพราะ toast หายเร็วเกินไปและก็อปยาก
 */
export default function PasswordRevealModal({ value }: { value: string | null }) {
  const [dismissedValue, setDismissedValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // เคลียร์ cookie ฝั่ง client ทันทีที่เห็นค่าใหม่ กัน modal โผล่ซ้ำตอน navigate ครั้งถัดไป
  useEffect(() => {
    if (!value) return;
    document.cookie = "pwreveal=; Max-Age=0; path=/";
  }, [value]);

  const data =
    value && value !== dismissedValue
      ? (() => {
          const i = value.indexOf("|");
          if (i < 0) return null;
          return {
            label: decodeURIComponent(value.slice(0, i)),
            password: decodeURIComponent(value.slice(i + 1)),
          };
        })()
      : null;

  if (!data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.password);
      setCopied(true);
    } catch {
      // clipboard permission blocked — ผู้ใช้ยังเลือกคัดลอกเองจากช่อง select-all ด้านล่างได้
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        setDismissedValue(value);
        setCopied(false);
      }}
      title="ตั้งรหัสผ่านสำหรับผู้ใช้ใหม่"
    >
      <p className="mb-2">{data.label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-base font-semibold tracking-wide text-neutral-900">
          {data.password}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
        </button>
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        บันทึกรหัสผ่านนี้ไว้ตอนนี้เลย — จะไม่แสดงซ้ำอีก (ใช้ปุ่ม &quot;คัดลอกรหัสผ่าน&quot; ในตารางเพื่อสุ่มรหัสใหม่ภายหลังได้)
      </p>
    </Modal>
  );
}

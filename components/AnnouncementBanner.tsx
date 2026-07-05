"use client";

import { useEffect, useRef } from "react";

export default function AnnouncementBanner({
  id,
  message,
}: {
  id: string;
  message: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // ซ่อนแบนเนอร์หลัง mount ถ้าผู้ใช้เคยกดปิดข้อความนี้ไปแล้วในเซสชันนี้
  useEffect(() => {
    if (sessionStorage.getItem("dismissed-announcement") === id && ref.current) {
      ref.current.style.display = "none";
    }
  }, [id]);

  return (
    <div
      ref={ref}
      className="flex items-start gap-3 border-b border-gold-200 bg-gold-50 px-8 py-3 text-sm text-brand-900"
    >
      <span className="mt-0.5">📢</span>
      <p className="flex-1 whitespace-pre-wrap">{message}</p>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("dismissed-announcement", id);
          if (ref.current) ref.current.style.display = "none";
        }}
        className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-900"
      >
        ปิด
      </button>
    </div>
  );
}

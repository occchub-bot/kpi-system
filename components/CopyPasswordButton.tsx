"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { resetPasswordAction } from "@/lib/actions";

/** สุ่มรหัสผ่านใหม่ให้ผู้ใช้ แล้วคัดลอกเข้าคลิปบอร์ดทันที (แทนการโชว์ให้พิมพ์ตามจาก toast) */
export default function CopyPasswordButton({ userId, className }: { userId: string; className?: string }) {
  const [pending, startTransition] = useTransition();

  return (
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
          try {
            await navigator.clipboard.writeText(result.password);
            toast.success(`คัดลอกรหัสผ่านใหม่ของ ${result.email} แล้ว`);
          } catch {
            toast.success(`รหัสผ่านใหม่ของ ${result.email}: ${result.password}`);
          }
        });
      }}
    >
      {pending ? "กำลังสุ่มรหัส…" : "คัดลอกรหัสผ่าน"}
    </button>
  );
}

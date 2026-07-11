"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Card className="w-full p-6">
        <p className="text-base font-semibold text-neutral-900">โหลดหน้านี้ไม่สำเร็จ</p>
        <p className="mt-1 text-sm text-neutral-500">เกิดข้อผิดพลาดชั่วคราว ลองโหลดหน้านี้ใหม่อีกครั้ง</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          ลองใหม่อีกครั้ง
        </button>
      </Card>
    </div>
  );
}

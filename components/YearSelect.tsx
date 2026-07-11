"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function YearSelect({
  years,
  value,
}: {
  years: number[];
  value: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return (
    <label className="text-right text-xs text-neutral-500">
      <span className="mb-1 block">ปี</span>
      <select
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.set("year", e.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="w-40 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}

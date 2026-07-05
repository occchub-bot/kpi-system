"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/components/ui";

export default function Sidebar({
  companyName,
  sections,
  footer,
  logout,
}: {
  companyName: string;
  sections: NavSection[];
  footer: { name: string; sub: string };
  logout: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    // "การจัดการ" ครอบคลุมเฉพาะหน้าจัดการย่อย (ไม่รวม /evaluate)
    if (href === "/manage") return pathname.startsWith("/manage");
    if (pathname === href) return true;
    // /me ต้อง match แบบเป๊ะ ไม่งั้นจะ active พร้อม /me/kpi
    if (href === "/me" || href === "/") return false;
    return pathname.startsWith(href + "/");
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white">
      <div className="px-6 py-5">
        <Image src="/logo.png" alt="" width={36} height={36} className="mb-3 h-9 w-9" />
        <p className="font-bold leading-tight text-brand-900">KPI System</p>
        <p className="text-xs text-neutral-500">{companyName}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {sections.map((sec) => (
          <div key={sec.title} className="mb-5">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              {sec.title}
            </p>
            <div className="space-y-0.5">
              {sec.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive(it.href)
                      ? "bg-brand-800 font-medium text-white"
                      : "text-neutral-700 hover:bg-brand-50"
                  )}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] px-6 py-4">
        <p className="text-sm font-semibold">{footer.name}</p>
        <p className="text-xs text-neutral-500">{footer.sub}</p>
        <form action={logout} className="mt-3">
          <button type="submit" className="text-xs text-neutral-500 underline hover:text-brand-800">
            ออกจากระบบ
          </button>
        </form>
      </div>
    </aside>
  );
}

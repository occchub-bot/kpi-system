import Link from "next/link";
import type { ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- layout primitives ---------------- */
export function PageTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="text-2xl font-bold tracking-tight">{children}</h2>
      {right}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-[var(--border)] bg-white", className)}>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      {title && <h3 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h3>}
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white py-14 text-center text-sm text-neutral-400">
      {children}
    </div>
  );
}

/* ---------------- modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        {title && <p className="mb-2 text-base font-semibold text-neutral-900">{title}</p>}
        <div className="text-sm text-neutral-600">{children}</div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- table ---------------- */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[13px] text-neutral-500">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-5 py-3 font-medium", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-5 py-4 align-middle", className)}>{children}</td>;
}
export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-[var(--border)] last:border-0">{children}</tr>;
}

/* ---------------- buttons & links ---------------- */
export function Button({
  children,
  type = "submit",
  variant = "primary",
  className,
}: {
  children: ReactNode;
  type?: "submit" | "button";
  variant?: "primary" | "outline";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        variant === "primary"
          ? "bg-brand-800 text-white hover:bg-brand-700"
          : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100",
        className
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        variant === "primary"
          ? "bg-brand-800 text-white hover:bg-brand-700"
          : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
      )}
    >
      {children}
    </Link>
  );
}

/* ---------------- form fields ---------------- */
const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, props.className)} />;
}

/* ---------------- score helpers ---------------- */
export function Score({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-neutral-300">—</span>;
  return <span className="font-semibold tabular-nums">{value.toFixed(1)}</span>;
}

export const TONES = {
  neutral: "border-neutral-300 bg-white text-neutral-700",
  green: "border-green-200 bg-green-50 text-green-700",
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  pink: "border-pink-200 bg-pink-50 text-pink-700",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  gold: "border-gold-200 bg-gold-50 text-gold-700",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status: "draft" | "submitted" | "evaluated" }) {
  const map = {
    draft: { label: "ร่าง", cls: TONES.red },
    submitted: { label: "ส่งแล้ว", cls: TONES.amber },
    evaluated: { label: "ประเมินแล้ว", cls: TONES.green },
  } as const;
  const s = map[status];
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", s.cls)}>
      {s.label}
    </span>
  );
}

/** กราฟแท่งแนวตั้งแบบมินิมอล (bell curve / distribution) */
export function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-3" style={{ height: 180 }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs tabular-nums text-neutral-500">{d.count}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-brand-700"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }}
            />
          </div>
          <span className="text-[11px] text-neutral-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

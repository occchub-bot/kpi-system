import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "@/lib/actions";
import { readDB } from "@/lib/store";
import { Button, Field, Input, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (me) redirect("/");
  const sp = await searchParams;

  // รายชื่ออีเมลตัวอย่างให้ทดลองล็อกอิน (prototype) — เหลือตำแหน่งละ 1 คนพอ
  const order = ["admin", "ceo", "hr", "division_head", "dept_manager", "employee"];
  const seenRoles = new Set<string>();
  const db = await readDB();
  const demo = db.users
    .slice()
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .filter((u) => {
      if (seenRoles.has(u.role)) return false;
      seenRoles.add(u.role);
      return true;
    });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <Image src="/logo.png" alt="" width={44} height={44} className="mb-4 h-11 w-11" />
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">KPI System</h1>
        <p className="mt-1 text-sm text-neutral-500">เข้าสู่ระบบด้วยอีเมลของคุณ</p>
      </div>

      <form action={loginAction} className="space-y-4">
        <Field label="อีเมล">
          <Input name="email" type="email" placeholder="you@example.com" required autoFocus />
        </Field>
        {sp.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            ไม่พบอีเมลนี้ในระบบ
          </p>
        )}
        <Button className="w-full">เข้าสู่ระบบ</Button>
      </form>

      <div className="mt-8">
        <p className="mb-2 text-xs font-medium text-neutral-500">บัญชีตัวอย่าง (คลิกเพื่อกรอก)</p>
        <div className="space-y-1">
          {demo.map((u) => (
            <form key={u.id} action={loginAction}>
              <input type="hidden" name="email" value={u.email} />
              <SubmitButton className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:border-brand-200 hover:bg-brand-50">
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-neutral-400">
                  {roleLabel(u.role)} · {u.email}
                </span>
              </SubmitButton>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}

function roleLabel(role: string): string {
  return (
    {
      admin: "ผู้ดูแลระบบ",
      hr: "HR",
      ceo: "CEO",
      division_head: "ผู้บริหารฝ่าย",
      dept_manager: "ผจก.แผนก",
      employee: "พนักงาน",
    }[role] ?? role
  );
}

import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "@/lib/actions";
import { Button, Field, Input } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (me) redirect("/");
  const sp = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <Image src="/logo.png" alt="" width={44} height={44} className="mb-4 h-11 w-11" />
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">OCCCKey</h1>
        <p className="mt-1 text-sm text-neutral-500">เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของคุณ</p>
      </div>

      <form action={loginAction} className="space-y-4">
        <Field label="อีเมล">
          <Input name="email" type="email" placeholder="you@example.com" required autoFocus />
        </Field>
        <Field label="รหัสผ่าน">
          <Input name="password" type="password" required />
        </Field>
        {sp.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            อีเมลหรือรหัสผ่านไม่ถูกต้อง
          </p>
        )}
        <Button className="w-full">เข้าสู่ระบบ</Button>
      </form>
    </div>
  );
}

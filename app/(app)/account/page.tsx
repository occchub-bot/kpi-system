import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { changeOwnPasswordAction } from "@/lib/actions";
import { PageTitle, Section, Card, Field, Input, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  return (
    <div className="max-w-md">
      <PageTitle>บัญชีของฉัน</PageTitle>
      <Section title="เปลี่ยนรหัสผ่าน">
        <Card className="p-5">
          <form action={changeOwnPasswordAction} className="space-y-3">
            <Field label="รหัสผ่านปัจจุบัน">
              <Input name="current_password" type="password" required autoComplete="current-password" />
            </Field>
            <Field label="รหัสผ่านใหม่">
              <Input name="new_password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่">
              <Input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Button>เปลี่ยนรหัสผ่าน</Button>
          </form>
        </Card>
      </Section>
    </div>
  );
}

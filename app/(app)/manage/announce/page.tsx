import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sendAnnouncementAction } from "@/lib/actions";
import { PageTitle, Section, Card, Field, Textarea, Button, Empty } from "@/components/ui";
import { readDB } from "@/lib/store";
import { announcementsOf, userName } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AnnouncePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "hr" || !me.companyId) redirect("/");

  const db = await readDB();
  const announcements = announcementsOf(db, me.companyId);

  return (
    <div className="max-w-3xl">
      <PageTitle>ส่งข้อความถึงพนักงาน</PageTitle>
      <p className="mb-5 -mt-3 text-sm text-neutral-500">
        ข้อความเดียวกันนี้จะแสดงให้พนักงานทุกคนในบริษัทเห็นที่ด้านบนของทุกหน้า
      </p>

      <Section title="เขียนข้อความใหม่">
        <Card className="p-5">
          <form action={sendAnnouncementAction} className="space-y-3">
            <Field label="ข้อความ">
              <Textarea name="message" rows={3} placeholder="เช่น แจ้งวันหยุดบริษัท / ประกาศเรื่องนโยบายใหม่" required />
            </Field>
            <Button>ส่งถึงพนักงานทุกคน</Button>
          </form>
        </Card>
      </Section>

      <Section title="ประวัติข้อความที่ส่งแล้ว">
        {announcements.length === 0 ? (
          <Empty>ยังไม่มีข้อความที่ส่ง</Empty>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id} className="p-4">
                <p className="text-sm text-neutral-900">{a.message}</p>
                <p className="mt-2 text-xs text-neutral-400">
                  {userName(db, a.createdById)} · {new Date(a.createdAt).toLocaleString("th-TH")}
                </p>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

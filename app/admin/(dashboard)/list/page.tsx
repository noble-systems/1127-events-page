import { SubscriberTable } from "@/components/admin/SubscriberTable";
import { listSubmissions } from "@/lib/store";

export default async function AdminListPage() {
  const rows = await listSubmissions();

  return (
    <>
      <h1 className="text-4xl leading-tight">People</h1>
      <p className="text-ink/65 mt-2.5 max-w-2xl text-[0.9375rem] leading-relaxed">
        RSVPs, talent applications, ambassador applications and partner inquiries,
        each in their own list. Open a record to read what they sent, move it
        through the pipeline and keep internal notes.
      </p>

      <div className="mt-10">
        <SubscriberTable rows={rows} />
      </div>
    </>
  );
}

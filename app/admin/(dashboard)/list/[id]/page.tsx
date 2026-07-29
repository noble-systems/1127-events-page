import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, TYPE_LABELS } from "@/components/admin/StatusBadge";
import { SubmissionDetail } from "@/components/admin/SubmissionDetail";
import { fromUrlId } from "@/lib/ids";
import { getSubmission } from "@/lib/store";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pk = fromUrlId(id);
  const submission = pk ? await getSubmission(pk) : null;

  if (!submission) notFound();

  return (
    <>
      <Link
        href="/admin/list"
        className="label-xs text-ink/65 hover:text-ink underline-offset-4 hover:underline"
      >
        ← All people
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl leading-tight">
          {submission.name || submission.email}
        </h1>
        <StatusBadge status={submission.status} />
        <span className="bg-ink/[0.06] text-ink/70 rounded-full px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase">
          {TYPE_LABELS[submission.type] ?? submission.type}
        </span>
      </div>

      <div className="mt-10">
        <SubmissionDetail submission={submission} />
      </div>
    </>
  );
}

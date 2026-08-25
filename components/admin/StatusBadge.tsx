import { STATUS_LABELS, type SubmissionStatus } from "@/lib/types";

/** New is the only one that shouts. The rest are states you have handled. */
const TONE: Record<SubmissionStatus, string> = {
  new: "bg-sun/25 text-sun-deep",
  reviewing: "bg-cobalt/12 text-cobalt",
  contacted: "bg-cobalt/12 text-cobalt",
  accepted: "bg-emerald-600/15 text-emerald-800",
  declined: "bg-ink/[0.08] text-ink/65",
  archived: "bg-ink/[0.08] text-ink/65",
  // Mailing list states
  subscribed: "bg-emerald-600/15 text-emerald-800",
  unsubscribed: "bg-ink/[0.08] text-ink/65",
  bounced: "bg-terracotta/15 text-terracotta-deep",
};

export function StatusBadge({
  status = "new",
  className = "",
}: {
  status?: SubmissionStatus;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase ${TONE[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export const TYPE_LABELS: Record<string, string> = {
  // The stored type stays "rsvp" (it is a storage key); the word people see
  // follows the product, which sells tickets and keeps a subscriber list.
  rsvp: "Subscriber",
  talent: "Talent",
  ambassador: "Ambassador",
  partner: "Partner inquiry",
};

import Link from "next/link";
import type { SubscriptionSummary } from "@/lib/audience";
import { subscriptionState } from "@/lib/audience";
import { toUrlId } from "@/lib/ids";
import { UNSUBSCRIBE_SOURCE_LABELS, type SubmissionRecord } from "@/lib/types";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="border-ink/12 bg-bone rounded-2xl border p-6">
      <p className="label-xs text-ink/65 flex min-h-[2.4em] items-start">{label}</p>
      <p className="font-display mt-3 text-4xl leading-none">{value}</p>
      <p className="text-ink/65 mt-3 text-[0.8125rem] leading-relaxed">{hint}</p>
    </div>
  );
}

/** Dates only. The exact minute of an opt-out is noise on this screen. */
function day(value: string | undefined): string {
  if (!value) return "Date not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date not recorded"
    : parsed.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function SubscriptionsView({
  summary,
  rsvps,
  rows,
}: {
  summary: SubscriptionSummary;
  rsvps: number;
  rows: SubmissionRecord[];
}) {
  return (
    <>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="On the RSVP list"
          value={rsvps}
          hint="Everyone who has ever RSVPed. This number does not go down when somebody unsubscribes."
        />
        <Stat
          label="Subscribed"
          value={summary.subscribed}
          hint="Opted in and not since opted out. These are the people you may email."
        />
        <Stat
          label="Unsubscribed"
          value={summary.unsubscribed}
          hint="Asked to stop, or never opted in. Still on the RSVP list."
        />
        <Stat
          label="Recorded by hand"
          value={summary.manual}
          hint="Opt-outs an admin entered, rather than a click or a bounce."
        />
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Off the list</h2>
        <p className="text-ink/65 mt-2 max-w-2xl text-[0.9375rem] leading-relaxed">
          Kept deliberately. An unsubscribe is a standing instruction, so this is
          the record that stops somebody being emailed again after a re-import or
          a fresh signup. Deleting it would make the next signup look like
          consent.
        </p>

        {rows.length === 0 ? (
          <p className="border-ink/25 bg-bone/60 text-ink/65 mt-5 rounded-2xl border border-dashed px-6 py-10 text-center text-[0.9375rem]">
            Nobody has come off the list.
          </p>
        ) : (
          <ul className="border-ink/12 bg-bone divide-ink/10 mt-5 divide-y overflow-hidden rounded-2xl border">
            {rows.map((row) => {
              const state = subscriptionState(row);
              return (
                <li key={row.pk}>
                  <Link
                    href={`/admin/list/${toUrlId(row.pk)}`}
                    className="hover:bg-bone-soft flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 transition-colors duration-200"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {row.name?.trim() || row.email}
                      </span>
                      {row.name?.trim() ? (
                        <span className="text-ink/65 block truncate text-[0.8125rem]">
                          {row.email}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-ink/65 text-[0.8125rem]">
                      {state === "bounced"
                        ? UNSUBSCRIBE_SOURCE_LABELS.bounce
                        : row.unsubscribedSource
                          ? UNSUBSCRIBE_SOURCE_LABELS[row.unsubscribedSource]
                          : "Never opted in"}
                    </span>
                    <span className="text-ink/65 w-32 text-right text-[0.8125rem]">
                      {row.unsubscribedAt ? day(row.unsubscribedAt) : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionsView } from "@/components/admin/SubscriptionsView";
import { rsvpList, subscriptionSummary, unsubscribes } from "@/lib/audience";
import { listSubmissions } from "@/lib/store";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

/**
 * Subscription state, kept apart from the RSVP list on purpose.
 *
 * An RSVP is a fact: this person said they were coming to this night, and that
 * stays true. A subscription is a standing preference about hearing from you
 * again, and it can be withdrawn without touching the first. They used to be
 * the same thing, so unsubscribing removed somebody from the RSVP list, which
 * is what this page exists to make impossible to miss.
 */
export default async function SubscriptionsPage() {
  const everyone = await listSubmissions();

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl">Subscriptions</h1>
        <p className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
          Who you may email, and everyone who has come off the list. Leaving the
          list does not remove anybody from{" "}
          <Link
            href="/admin/list"
            className="text-cobalt underline-offset-4 hover:underline"
          >
            People
          </Link>
          : the nights they came to still happened, and the record of the opt-out
          is what stops them being emailed again if they are ever re-imported.
        </p>
      </header>

      <SubscriptionsView
        summary={subscriptionSummary(everyone)}
        rsvps={rsvpList(everyone).length}
        rows={unsubscribes(everyone)}
      />
    </div>
  );
}

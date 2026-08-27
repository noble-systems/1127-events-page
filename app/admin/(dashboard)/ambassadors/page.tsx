import type { Metadata } from "next";
import { AmbassadorManager } from "@/components/admin/AmbassadorManager";
import { REWARD_EVERY_DEFAULT, ambassadorStats } from "@/lib/ambassadors";
import {
  getOnboardTicket,
  getRewardEvery,
  getRewardTierName,
  getWelcomeTemplate,
  listAmbassadors,
  readAmbassadorClicks,
} from "@/lib/ambassadors-store";
import { siteUrl } from "@/lib/email";
import { listAllEvents, listSubmissions } from "@/lib/store";
import { listAllOrders } from "@/lib/tickets-store";

export const metadata: Metadata = { title: "Ambassadors" };
export const dynamic = "force-dynamic";

/**
 * The payout sheet. Every code, what it brought in, and the link to hand
 * out. Counts are derived fresh from the order and RSVP paper trail on every
 * load, never from counters that could drift from it.
 */
export default async function AdminAmbassadorsPage() {
  const [
    ambassadors,
    orders,
    rsvps,
    rewardEvery,
    rewardTierName,
    events,
    welcomeTemplate,
    onboardTicket,
  ] = await Promise.all([
    listAmbassadors(),
    listAllOrders(),
    listSubmissions("rsvp"),
    getRewardEvery(REWARD_EVERY_DEFAULT),
    getRewardTierName(),
    listAllEvents(),
    getWelcomeTemplate(),
    getOnboardTicket(),
  ]);
  // Off-site tiers cannot be minted, so the welcome-ticket picker skips them.
  const mintable = events
    .map((event) => ({
      id: event.id,
      name: event.name,
      tiers: (event.ticketTiers ?? [])
        .filter((tier) => !tier.externalUrl)
        .map((tier) => ({ id: tier.id, name: tier.name })),
    }))
    .filter((event) => event.tiers.length > 0);
  const tierNames = [
    ...new Set(
      events.flatMap((event) =>
        (event.ticketTiers ?? []).map((tier) => tier.name),
      ),
    ),
  ];
  const clicks = await readAmbassadorClicks(ambassadors.map((a) => a.code));

  const stats = ambassadorStats(ambassadors, orders, rsvps, clicks);

  return (
    <div className="pb-16">
      <h1 className="text-4xl">Ambassadors</h1>
      <p className="text-ink/65 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">
        Each ambassador gets one code and one link. The link goes in their
        bios and stories and lands people on whatever is on: tickets when
        selling, otherwise the signup page. The code can also be typed at
        ticket checkout. Signups and sales carry the code with them, and this
        page counts them, which is the number their incentives are paid
        against. A code changes who gets credit, never what anybody pays.
      </p>

      <div className="mt-8">
        <AmbassadorManager
          stats={stats}
          siteUrl={siteUrl()}
          rewardEvery={rewardEvery}
          rewardTierName={rewardTierName}
          tierNames={tierNames}
          welcomeSubject={welcomeTemplate.subject}
          welcomeBody={welcomeTemplate.body}
          onboardEventId={onboardTicket.eventId}
          onboardTierId={onboardTicket.tierId}
          events={mintable}
        />
      </div>
    </div>
  );
}

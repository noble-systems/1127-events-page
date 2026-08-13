import type { Metadata } from "next";
import { AmbassadorManager } from "@/components/admin/AmbassadorManager";
import { ambassadorStats } from "@/lib/ambassadors";
import { listAmbassadors } from "@/lib/ambassadors-store";
import { siteUrl } from "@/lib/email";
import { listSubmissions } from "@/lib/store";
import { listAllOrders } from "@/lib/tickets-store";

export const metadata: Metadata = { title: "Ambassadors" };
export const dynamic = "force-dynamic";

/**
 * The payout sheet. Every code, what it brought in, and the link to hand
 * out. Counts are derived fresh from the order and RSVP paper trail on every
 * load, never from counters that could drift from it.
 */
export default async function AdminAmbassadorsPage() {
  const [ambassadors, orders, rsvps] = await Promise.all([
    listAmbassadors(),
    listAllOrders(),
    listSubmissions("rsvp"),
  ]);

  const stats = ambassadorStats(ambassadors, orders, rsvps);

  return (
    <div className="pb-16">
      <h1 className="text-4xl">Ambassadors</h1>
      <p className="text-ink/65 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">
        Each ambassador gets one code and one link. The link goes in their
        bios and stories and lands people on whatever is on: tickets when
        selling, otherwise the RSVP page. The code can also be typed at
        ticket checkout. Signups and sales carry the code with them, and this
        page counts them, which is the number their incentives are paid
        against. A code changes who gets credit, never what anybody pays.
      </p>

      <div className="mt-8">
        <AmbassadorManager stats={stats} siteUrl={siteUrl()} />
      </div>
    </div>
  );
}

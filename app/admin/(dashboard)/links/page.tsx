import type { Metadata } from "next";
import { TrackLinksManager } from "@/components/admin/TrackLinksManager";
import { siteUrl } from "@/lib/email";
import { listAllOrders } from "@/lib/tickets-store";
import { listTrackLinks, trackLinkStats } from "@/lib/track-links";

export const metadata: Metadata = { title: "Tracking links" };
export const dynamic = "force-dynamic";

/**
 * Which post drove which sale. One obscure link per posting spot; the id in
 * the URL says nothing, the label here says everything. Numbers are derived
 * fresh from the order paper trail on every load, same as the ambassador
 * board.
 */
export default async function AdminLinksPage() {
  const [links, orders] = await Promise.all([listTrackLinks(), listAllOrders()]);
  const stats = trackLinkStats(links, orders);

  return (
    <div className="pb-16">
      <h1 className="text-4xl">Tracking links</h1>
      <p className="text-ink/65 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">
        One link per place a post goes: each story, the bio, a flyer QR, a
        group chat. The link lands people wherever the site is sending them
        (tickets while selling, otherwise signups) and every sale it drives
        is counted here against the place you posted it. The URL itself is
        deliberately meaningless, so nobody can read your marketing plan out
        of it.
      </p>

      <div className="mt-8">
        <TrackLinksManager stats={stats} siteUrl={siteUrl()} />
      </div>
    </div>
  );
}

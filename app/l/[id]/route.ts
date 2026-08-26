import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/email";
import { listPublicEvents } from "@/lib/store";
import { isSelling } from "@/lib/tickets";
import { bumpTrackTap, getTrackLink } from "@/lib/track-links";

/**
 * GET /l/<id>, a tracking link for one specific post: an Instagram story, the
 * bio, a group chat. Same landing logic as the ambassador links (tickets when
 * the featured event is selling, otherwise signups), but the id credits a
 * PLACE rather than a person, and carries on as ?src= for checkout to store.
 *
 * An unknown id still lands people on the site; the post is already public
 * and the visitor is real, they just count for nothing.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: raw } = await params;
  const link = await getTrackLink((raw ?? "").toLowerCase()).catch(() => null);

  const events = await listPublicEvents().catch(() => []);
  const featured = events.find((event) => event.featured) ?? null;

  const target =
    featured && isSelling(featured)
      ? `/tickets/${encodeURIComponent(featured.id)}`
      : featured && featured.rsvpEnabled !== false
        ? `/rsvp/${encodeURIComponent(featured.id)}`
        : "/rsvp";

  if (link) void bumpTrackTap(link.id);

  const suffix = link ? `?src=${encodeURIComponent(link.id)}` : "";
  return NextResponse.redirect(`${siteUrl()}${target}${suffix}`, 307);
}

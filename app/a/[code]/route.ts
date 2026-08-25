import { NextResponse } from "next/server";
import { normalizeAmbassadorCode } from "@/lib/ambassadors";
import { activeAmbassadorCode, bumpAmbassadorClicks } from "@/lib/ambassadors-store";
import { siteUrl } from "@/lib/email";
import { listPublicEvents } from "@/lib/store";
import { isSelling } from "@/lib/tickets";

/**
 * GET /a/<code>, the link an ambassador puts in a story or a bio.
 *
 * One short link per ambassador, and the site decides where it should land:
 * the featured event's tickets page when tickets are selling, otherwise its
 * RSVP page, otherwise /rsvp in general. The code travels on as ?via=, which
 * the forms and the checkout carry to the server, where it is verified again
 * before anything is stored.
 *
 * A dead or unknown code still lands people on the site (the promo already
 * ran; the visitor is real) but carries nothing.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = await activeAmbassadorCode(normalizeAmbassadorCode(raw ?? ""));

  const events = await listPublicEvents().catch(() => []);
  const featured = events.find((event) => event.featured) ?? null;

  const target =
    featured && isSelling(featured)
      ? `/tickets/${encodeURIComponent(featured.id)}`
      : featured && featured.rsvpEnabled !== false
        ? `/rsvp/${encodeURIComponent(featured.id)}`
        : "/rsvp";

  // The tap count is the "how many used their link" number on the
  // dashboard. Best effort; a lost tick must never slow the redirect.
  if (code) void bumpAmbassadorClicks(code);

  const suffix = code ? `?via=${encodeURIComponent(code)}` : "";
  return NextResponse.redirect(`${siteUrl()}${target}${suffix}`, 307);
}

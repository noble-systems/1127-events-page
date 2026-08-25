import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RsvpPageView } from "@/components/RsvpPageView";
import { listPublicEvents } from "@/lib/store";
import { isSelling } from "@/lib/tickets";

export const revalidate = 60;

const title = "Join the list";
const description =
  "Join the list and hear about the next 1127 Events date in Old Town Scottsdale before it's public.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/rsvp" },
  openGraph: {
    title: `${title}, 1127 Events`,
    description,
    url: "/rsvp",
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
};

/**
 * The general RSVP address, which forwards to whichever event is featured.
 *
 * Every event has its own page at /rsvp/<id>. This one exists because "1127
 * .events/rsvp" is what you say out loud and print on a flyer, and because it
 * should keep working when the featured slot moves to the next night. It
 * redirects rather than rendering a copy of the form so there is exactly one
 * URL per event: signups are attributed by which page they came from, and two
 * addresses feeding the same event would make that history harder to read.
 *
 * With nothing featured there is nowhere to forward to, so the page renders the
 * series copy and a general signup form instead of 404ing.
 */
export default async function RsvpPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; via?: string }>;
}) {
  const [events, params] = await Promise.all([listPublicEvents(), searchParams]);

  /**
   * ?event= is the older form of the per-event link, still honoured so shared
   * and printed links keep working. It is resolved against the published
   * events rather than trusted, so a crafted link cannot attribute a signup to
   * an event that does not exist, or open a form for an unpublished draft.
   */
  const requested = params.event
    ? (events.find((event) => event.id === params.event) ??
      events.find((event) => (event.formerIds ?? []).includes(params.event!)))
    : undefined;

  /**
   * A requested event goes to its own page whatever its state; that page now
   * explains a closed list itself. The featured fallback still skips closed
   * events, because /rsvp on a flyer should always land somewhere a signup
   * can happen.
   */
  const open = events.filter((event) => event.rsvpEnabled !== false);
  const target = requested ?? open.find((event) => event.featured);

  // The ambassador code survives the hop to the event's own page.
  const viaSuffix = params.via ? `?via=${encodeURIComponent(params.via)}` : "";
  if (target) redirect(`/rsvp/${encodeURIComponent(target.id)}${viaSuffix}`);

  /**
   * No open list to forward to, but a sale might still be live (an event can
   * sell tickets with its signup list off). The generic page must say so
   * instead of claiming nothing is happening.
   */
  const seller =
    events.find((event) => event.featured && isSelling(event)) ??
    events.find((event) => isSelling(event));

  return <RsvpPageView via={params.via} ticketEvent={seller} />;
}

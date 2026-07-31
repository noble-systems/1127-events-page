import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Ambassadors } from "@/components/sections/Ambassadors";
import { FinalCta } from "@/components/sections/FinalCta";
import { Hero } from "@/components/sections/Hero";
import { Partner } from "@/components/sections/Partner";
import { UpcomingEvents } from "@/components/sections/UpcomingEvents";
import type { SiteContent } from "@/lib/site-content";
import type { EventRecord } from "@/lib/types";

/**
 * The homepage body.
 *
 * Extracted so the live editor renders the page rather than an impression of
 * it. A preview built from its own markup is a preview of the preview: it
 * drifts the moment a section changes, and the drift is invisible until
 * something ships looking wrong. This is the same tree the public page mounts,
 * with content coming from a draft instead of the store.
 *
 * Everything here is a pure synchronous component, which is what lets the
 * editor re-render it on every keystroke without touching the server.
 */
export function HomeSections({
  content,
  events,
}: {
  content: SiteContent;
  events: EventRecord[];
}) {
  // One featured event drives both the hero and the series intro, so they can
  // never describe different events.
  const featured = events.find((event) => event.featured) ?? null;

  return (
    <>
      <SiteHeader rsvpOpen={Boolean(featured && featured.rsvpEnabled !== false)} />
      <main id="main">
        <Hero content={content.hero} event={featured} />
        <UpcomingEvents
          events={events}
          copy={content.upcoming}
          factRows={content.facts}
        />
        <Ambassadors content={content.ambassadors} />
        <Partner content={content.partner} />
        <FinalCta content={content.finalCta} />
      </main>
      <SiteFooter />
    </>
  );
}

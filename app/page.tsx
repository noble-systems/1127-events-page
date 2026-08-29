import { HomeSections } from "@/components/HomeSections";
import { brand, contact, hero } from "@/content/site";
import { getSiteContent, listPublicEvents } from "@/lib/store";
import type { EventRecord } from "@/lib/types";

/**
 * Rendered per request.
 *
 * This used to be `revalidate = 60`, on the belief that it meant the event list
 * was not baked in at build time. It did not. Next prerendered the page during
 * the build, and the Amplify build role has no DynamoDB access (only the
 * compute role does), so listPublicEvents() threw, fell back to the seed events
 * and baked those in. The site then served a hero and an event list that had
 * nothing to do with the dashboard: an event marked Featured never appeared,
 * and Sun Club showed permanently because it is the first seed event. Amplify
 * did not reliably regenerate it either, answering `x-nextjs-cache: STALE`
 * indefinitely.
 *
 * Nothing here is worth caching against that. It is one small scan on a page
 * whose whole job is to show what the dashboard currently says.
 */
export const dynamic = "force-dynamic";

/**
 * Structured data. Only facts we actually have. No dates, prices, venues or
 * attendance figures are asserted. Add `startDate`/`location` to the event
 * schema once a date and venue are confirmed.
 */
function StructuredData({ events }: { events: EventRecord[] }) {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: brand.domain,
    description: brand.description,
    // Search engines use this to tie the site and the profile to one entity.
    ...(contact.instagramUrl ? { sameAs: [contact.instagramUrl] } : {}),
    logo: `${brand.domain}/apple-icon.png`,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Scottsdale",
      addressRegion: "AZ",
      addressCountry: "US",
    },
    areaServed: "Phoenix Metropolitan Area, Arizona",
    knowsAbout: [
      "Event production",
      "House music events",
      "Audience development",
      "Live audio production",
    ],
  };

  const featured = events.find((event) => event.featured) ?? null;

  const series = featured && {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    name: featured.name,
    description: featured.summary,
    organizer: { "@type": "Organization", name: brand.name, url: brand.domain },
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: hero.location,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Scottsdale",
        addressRegion: "AZ",
        addressCountry: "US",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // JSON.stringify does not escape "<", so an event name containing
        // "</script>" would close this tag and execute whatever follows. Event
        // names come from the dashboard, so that is stored XSS against every
        // visitor, and an earlier comment here claiming the content was "authored
        // in this repo, not user input" stopped being true when events moved into
        // the database.
        //
        // Escaping "<" as < is the standard fix: a JSON parser reads it as
        // an identical string, but an HTML parser never sees a tag.
        __html: JSON.stringify([organization, series].filter(Boolean)).replace(
          /</g,
          "\\u003c",
        ),
      }}
    />
  );
}

export default async function HomePage() {
  // One read, passed down. Sections fall back to the committed defaults if
  // this ever comes back empty, so the page cannot render blank.
  const [events, content] = await Promise.all([
    listPublicEvents(),
    getSiteContent(),
  ]);

  return (
    <>
      <StructuredData events={events} />
      <HomeSections content={content} events={events} />
    </>
  );
}

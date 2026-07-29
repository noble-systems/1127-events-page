import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { About } from "@/components/sections/About";
import { Ambassadors } from "@/components/sections/Ambassadors";
import { Capabilities } from "@/components/sections/Capabilities";
import { FinalCta } from "@/components/sections/FinalCta";
import { Hero } from "@/components/sections/Hero";
import { MediaGrid } from "@/components/sections/MediaGrid";
import { Partner } from "@/components/sections/Partner";
import { SunClubIntro } from "@/components/sections/SunClubIntro";
import { UpcomingEvents } from "@/components/sections/UpcomingEvents";
import { brand, hero } from "@/content/site";
import { listPublicEvents } from "@/lib/store";
import type { EventRecord } from "@/lib/types";

/**
 * Events are edited in the admin dashboard, so the page revalidates rather
 * than baking the list in at build time. A publish from /admin also triggers
 * an immediate revalidation.
 */
export const revalidate = 60;

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

  const featured = events.find((event) => event.featured) ?? events[0];

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
      // Content is authored in this repo, not user input.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify([organization, series].filter(Boolean)),
      }}
    />
  );
}

export default async function HomePage() {
  const events = await listPublicEvents();

  return (
    <>
      <StructuredData events={events} />
      <SiteHeader />
      <main id="main">
        <Hero />
        <UpcomingEvents events={events} />
        <SunClubIntro />
        <Capabilities />
        <Ambassadors />
        <MediaGrid />
        <Partner />
        <About />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

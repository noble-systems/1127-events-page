import { brand } from "@/content/site";
import { eventSchedule } from "@/lib/event-schedule";
import { resolveImageSrc } from "@/lib/images";
import { remainingFor, sellableTiers } from "@/lib/tickets";
import type { EventRecord } from "@/lib/types";

/**
 * schema.org Event markup for one event page: what Google's event rich
 * results read. Only facts the record actually carries are asserted; a date
 * the parser cannot read means the whole block is omitted rather than
 * guessed. Offers reflect live availability at render time.
 */
export function EventJsonLd({
  event,
  pageUrl,
  /** taken-per-tier, so availability can say SoldOut truthfully. */
  taken,
}: {
  event: EventRecord;
  pageUrl: string;
  taken?: ReadonlyMap<string, number>;
}) {
  const schedule = eventSchedule(event.date, event.time);
  if (!schedule) return null;

  const image = resolveImageSrc(event.image);
  const tiers = sellableTiers(event);
  const offers = tiers.map((tier) => {
    if (tier.externalUrl) {
      return {
        "@type": "Offer",
        name: tier.name,
        url: tier.externalUrl,
        ...(tier.priceCents > 0
          ? { price: (tier.priceCents / 100).toFixed(2), priceCurrency: "USD" }
          : {}),
        availability:
          tier.soldOut === true
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
      };
    }
    const left = remainingFor(tier, taken?.get(tier.id) ?? 0);
    return {
      "@type": "Offer",
      name: tier.name,
      url: pageUrl,
      price: (tier.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability:
        left > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    };
  });

  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: event.summary || event.tagline,
    startDate: schedule.startDate,
    ...(schedule.endDate ? { endDate: schedule.endDate } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.location,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Scottsdale",
        addressRegion: "AZ",
        addressCountry: "US",
      },
    },
    ...(image
      ? { image: [image.startsWith("http") ? image : `${brand.domain}${image}`] }
      : {}),
    organizer: {
      "@type": "Organization",
      name: brand.name,
      url: brand.domain,
    },
    ...(offers.length > 0 ? { offers } : {}),
    url: pageUrl,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // "<" escaped so a hostile event name can never close the tag; same
        // treatment as the homepage schema.
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

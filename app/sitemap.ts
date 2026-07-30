import type { MetadataRoute } from "next";
import { brand } from "@/content/site";
import { listPublicEvents } from "@/lib/store";

export const revalidate = 3600;

/**
 * /rsvp redirects to whichever event is featured, so the addresses worth
 * indexing are the per-event ones. They are listed from the published events
 * rather than hardcoded, so a new event is discoverable as soon as it goes
 * live and disappears when it is unpublished.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let events: Awaited<ReturnType<typeof listPublicEvents>> = [];
  try {
    events = await listPublicEvents();
  } catch {
    // A sitemap missing its event pages beats a sitemap that 500s.
  }

  return [
    {
      url: brand.domain,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${brand.domain}/rsvp`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...events.map((event) => ({
      url: `${brand.domain}/rsvp/${event.id}`,
      lastModified: new Date(event.updatedAt),
      changeFrequency: "weekly" as const,
      priority: event.featured ? 0.9 : 0.7,
    })),
    {
      url: `${brand.domain}/opportunities`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${brand.domain}/partner`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${brand.domain}/cookies`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${brand.domain}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${brand.domain}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}

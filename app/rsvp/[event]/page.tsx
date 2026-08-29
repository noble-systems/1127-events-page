import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EventJsonLd } from "@/components/EventJsonLd";
import { RsvpPageView } from "@/components/RsvpPageView";
import { siteUrl } from "@/lib/email";
import { resolveImageSrc } from "@/lib/images";
import { listPublicEvents } from "@/lib/store";

export const revalidate = 60;

type Params = {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ via?: string }>;
};

/**
 * A permanent RSVP URL for one event.
 *
 * /rsvp shows whatever is featured, which is right for a link you hand out once
 * and reuse. It is wrong the moment two events are taking signups at the same
 * time: everybody who arrives is attributed to the featured one regardless of
 * which night they were invited to. This route fixes the event in the address,
 * so a link stays pointed at the night it was sent for even after the featured
 * slot moves on.
 *
 * Unpublished drafts 404 rather than render. An event with RSVPs turned OFF
 * still renders, as a page that says the list is not open, because this URL
 * gets shared and printed and a real visitor followed one straight into a 404
 * the first week these were live. A link somebody saved must say what is
 * happening, not die. The id is resolved against the published list, never
 * trusted from the URL, so a guessed slug cannot open a signup form for an
 * event that is not live yet; the form itself only renders when RSVPs are on.
 */
async function resolve(params: Params["params"]) {
  const [events, { event: id }] = await Promise.all([
    listPublicEvents(),
    params,
  ]);
  return {
    event: events.find((event) => event.id === id) ?? null,
    /**
     * The address of a renamed event. A direct id match always wins; failing
     * that, an event that lists this slug among its former ids claims it, and
     * the page redirects permanently to the current address. This is what
     * keeps a printed QR code alive across a rename.
     */
    moved:
      events.find((event) => (event.formerIds ?? []).includes(id)) ?? null,
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { event } = await resolve(params);
  if (!event) return { title: "Join the list" };

  const title = `Join the list for ${event.name}`;
  const description = event.summary || event.tagline;
  const url = `/rsvp/${event.id}`;
  // The event photograph beats the generic card in a feed or a DM preview.
  const image = resolveImageSrc(event.image);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title}, 1127 Events`,
      description,
      url,
      type: "website",
      ...(image ? { images: [image] } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EventRsvpPage({ params, searchParams }: Params) {
  const [{ event, moved }, { via }] = await Promise.all([
    resolve(params),
    searchParams,
  ]);
  if (event) {
    return (
      <>
        <EventJsonLd
          event={event}
          pageUrl={`${siteUrl()}/rsvp/${event.id}`}
        />
        <RsvpPageView featured={event} via={via} />
      </>
    );
  }
  if (moved) permanentRedirect(`/rsvp/${encodeURIComponent(moved.id)}`);
  notFound();
}

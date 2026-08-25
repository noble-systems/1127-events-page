import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TicketPicker, type PickerTier } from "@/components/TicketPicker";
import { Media } from "@/components/ui/Media";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Section";
import { PRESENTS } from "@/content/site";
import { hero } from "@/content/site";
import { listPublicEvents } from "@/lib/store";
import {
  formatMoney,
  remainingFor,
  sellableTiers,
  MAX_TICKETS_PER_ORDER,
} from "@/lib/tickets";
import { readInventory } from "@/lib/tickets-store";

/**
 * Rendered per request: the whole point of this page is the live seat count,
 * and a cached "3 left" is a lie within the minute. (Prerendering would also
 * bake seed data; the build role cannot reach the store.)
 */
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ via?: string }>;
};

async function resolve(params: Params["params"]) {
  const [events, { event: id }] = await Promise.all([
    listPublicEvents(),
    params,
  ]);
  return {
    event: events.find((event) => event.id === id) ?? null,
    // Renamed events keep their old address alive here exactly as /rsvp does.
    moved:
      events.find((event) => (event.formerIds ?? []).includes(id)) ?? null,
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { event } = await resolve(params);
  if (!event) return { title: "Tickets" };

  const title = `Tickets for ${event.name}`;
  const description = event.summary || event.tagline;
  const url = `/tickets/${event.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title}, 1127 Events`,
      description,
      url,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TicketsPage({ params, searchParams }: Params) {
  const [{ event, moved }, { via }] = await Promise.all([
    resolve(params),
    searchParams,
  ]);
  if (!event) {
    if (moved) permanentRedirect(`/tickets/${encodeURIComponent(moved.id)}`);
    notFound();
  }

  const tiers = sellableTiers(event);
  const selling = tiers.length > 0;

  /**
   * remaining = capacity minus everything held or sold. Sold out is a state
   * of the pool, not a flag anybody sets; lowering capacity below sales in
   * the admin simply reads as sold out here.
   */
  const inventory = selling
    ? await readInventory(
        event.id,
        tiers.map((tier) => tier.id),
      )
    : new Map();

  const pickerTiers: PickerTier[] = tiers.map((tier) => {
    const taken = inventory.get(tier.id)?.taken ?? 0;
    const remaining = remainingFor(tier, taken);
    return {
      id: tier.id,
      name: tier.name,
      priceLabel: formatMoney(tier.priceCents),
      max: Math.min(remaining, MAX_TICKETS_PER_ORDER),
      scarce: remaining > 0 && remaining < 10 ? remaining : null,
    };
  });

  return (
    <>
      <SiteHeader
        overlay={false}
      />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        <section
          aria-labelledby="tickets-title"
          className="bg-deep text-bone relative isolate overflow-hidden"
        >
          <div className="absolute inset-0 -z-10">
            <Media
              tone="dusk"
              src={hero.image}
              alt={hero.imageAlt}
              hideNote
              priority
              sizes="100vw"
              overlay="strong"
              className="h-full w-full"
            />
          </div>

          <div className="shell grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-16">
            <div className="on-dark lg:col-span-6">
              <Eyebrow className="text-sun-soft">{PRESENTS}</Eyebrow>

              <h1
                id="tickets-title"
                className="font-display mt-6 text-[2.75rem] leading-[0.95] font-semibold tracking-[-0.02em] uppercase sm:text-6xl lg:text-7xl"
              >
                {event.name}
              </h1>

              <p className="font-display text-bone/90 mt-6 text-[1.5rem] leading-tight sm:text-[1.9rem]">
                {event.tagline}
              </p>

              <dl className="border-bone/15 bg-bone/15 mt-10 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
                <div className="bg-deep px-5 py-5">
                  <dt className="label-xs text-bone/55">Date</dt>
                  <dd className="font-display mt-2 text-xl">
                    {[event.date?.trim(), event.time?.trim()]
                      .filter(Boolean)
                      .join(", ") || "Announcing soon"}
                  </dd>
                </div>
                <div className="bg-deep px-5 py-5">
                  <dt className="label-xs text-bone/55">Venue</dt>
                  <dd className="font-display mt-2 text-xl">
                    {event.venue?.trim() ||
                      event.location?.trim() ||
                      "Announcing soon"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-6">
              <div className="border-ink/10 bg-bone text-ink rounded-3xl border p-6 shadow-[0_40px_90px_-50px_rgba(4,12,32,0.9)] sm:p-9">
                {selling ? (
                  <>
                    <h2 className="text-3xl leading-tight sm:text-4xl">
                      Tickets
                    </h2>
                    <div className="mt-6">
                      <TicketPicker
                        eventId={event.id}
                        tiers={pickerTiers}
                        via={via}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl leading-tight sm:text-4xl">
                      Tickets aren&apos;t on sale yet
                    </h2>
                    <p className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
                      {`${event.name} isn't selling tickets right now. When sales open, they open on the site first. Hold onto this link; it will work the moment that happens.`}
                    </p>
                    <div className="mt-7">
                      <ButtonLink href="/" variant="primary" size="lg">
                        See what&apos;s coming
                        <ArrowIcon />
                      </ButtonLink>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { RsvpForm } from "@/components/forms/RsvpForm";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { hero, sunClub } from "@/content/site";
import type { EventRecord } from "@/lib/types";

/**
 * The RSVP page body, shared by /rsvp and /rsvp/[event].
 *
 * Extracted so two live events can each have their own signup URL without the
 * page existing twice. Everything specific to a night comes from `featured`;
 * the static copy below is about the series and holds regardless of which event
 * somebody arrived for.
 */

/**
 * The details grid is built from the event itself, not written here.
 *
 * This used to be four hardcoded bullets about house music and the pool,
 * shown identically on every event's RSVP page, so a bass night promised
 * "House music, all day". Facts the event actually carries cannot say the
 * wrong thing about it.
 */
function eventFacts(event?: EventRecord) {
  return [
    { title: event?.date?.trim() || "Announcing soon", body: "Date" },
    { title: event?.location?.trim() || "Old Town Scottsdale", body: "Location" },
    { title: event?.venue?.trim() || "Announcing soon", body: "Venue" },
    {
      title: event?.genres?.length ? event.genres.join(", ") : "Announcing soon",
      body: "Music",
    },
  ];
}

export function RsvpPageView({ featured }: { featured?: EventRecord }) {
  return (
    <>
      <SiteHeader
        overlay={false}
        rsvpOpen={Boolean(featured && featured.rsvpEnabled !== false)}
      />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        {/* ---------------------------------------------------------------- */}
        {/* Sign-up                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="rsvp-title"
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
              <Eyebrow className="text-sun-soft">1127 Events Presents</Eyebrow>

              <h1
                id="rsvp-title"
                className="font-display mt-6 text-[2.75rem] leading-[0.95] font-semibold tracking-[-0.02em] uppercase sm:text-6xl lg:text-7xl"
              >
                {featured?.name ?? hero.title}
              </h1>

              <p className="font-display text-bone/90 mt-6 text-[1.5rem] leading-tight sm:text-[1.9rem]">
                {featured?.tagline ?? hero.tagline}
              </p>

              <p className="text-bone/75 mt-6 max-w-lg text-[1.0625rem] leading-relaxed">
                Dates aren&apos;t public yet. Leave your details and you&apos;ll
                hear about the next one before anyone else, and get first access
                when the guest list opens.
              </p>

              <dl className="border-bone/15 bg-bone/15 mt-10 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
                <div className="bg-deep px-5 py-5">
                  <dt className="label-xs text-bone/55">Next date</dt>
                  <dd className="font-display mt-2 text-xl">
                    {featured?.date ?? hero.date}
                  </dd>
                </div>
                <div className="bg-deep px-5 py-5">
                  <dt className="label-xs text-bone/55">Location</dt>
                  <dd className="font-display mt-2 text-xl">
                    {featured?.location ?? hero.location}
                  </dd>
                </div>
                <div className="bg-deep px-5 py-5">
                  <dt className="label-xs text-bone/55">Venue</dt>
                  <dd className="font-display mt-2 text-xl">
                    {featured?.venue ?? "Announcing soon"}
                  </dd>
                </div>
                <div className="bg-deep px-5 py-5">
                  <dt className="label-xs text-bone/55">Music</dt>
                  <dd className="font-display mt-2 text-xl">House</dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-6">
              <div className="border-ink/10 bg-bone text-ink rounded-3xl border p-6 shadow-[0_40px_90px_-50px_rgba(4,12,32,0.9)] sm:p-9">
                <h2 className="text-3xl leading-tight sm:text-4xl">
                  Get on the list
                </h2>
                <p className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
                  Takes about fifteen seconds. We only email about 1127 events.
                </p>

                <div className="mt-7">
                  <RsvpForm eventId={featured?.id ?? ""} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* What to expect                                                    */}
        {/* ---------------------------------------------------------------- */}
        <Section tone="bone" size="md" labelledBy="expect-title">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <Reveal>
                <Eyebrow>What to expect</Eyebrow>
              </Reveal>
              <Reveal delay={60}>
                <h2
                  id="expect-title"
                  className="mt-5 text-[2rem] leading-[1.05] sm:text-4xl lg:text-[2.9rem]"
                >
                  {sunClub.title}
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-ink/70 mt-6 max-w-md text-[1.0625rem] leading-relaxed">
                  {featured?.summary?.trim() || sunClub.paragraphs[0]}
                </p>
              </Reveal>
              <Reveal delay={180}>
                <div className="mt-8">
                  <ButtonLink href="/" variant="outline" size="md">
                    More about 1127 Events
                    <ArrowIcon />
                  </ButtonLink>
                </div>
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <dl className="border-ink/12 bg-ink/12 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
                {eventFacts(featured).map((item, index) => (
                  <Reveal key={item.title} delay={index * 70}>
                    <div className="bg-bone h-full px-6 py-7">
                      <dt className="font-display text-xl leading-snug">
                        {item.title}
                      </dt>
                      <dd className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
                        {item.body}
                      </dd>
                    </div>
                  </Reveal>
                ))}
              </dl>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        {/* Partner cross-link                                                */}
        {/* ---------------------------------------------------------------- */}
        <Section tone="sand" size="sm">
          <Reveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="label-xs text-ink/65">Not here as a guest?</p>
                <p className="font-display mt-3 max-w-xl text-xl leading-snug sm:text-2xl">
                  1127 partners with venues, brands and local artists across
                  Arizona.
                </p>
              </div>
              <ButtonLink
                href="/partner"
                variant="primary"
                size="lg"
                className="shrink-0 self-start sm:self-auto"
              >
                Partner With 1127
                <ArrowIcon />
              </ButtonLink>
            </div>
          </Reveal>
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}

import { Editable } from "@/components/edit/Editable";
import { EditNotice } from "@/components/edit/EditNotice";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { hero, PRESENTS } from "@/content/site";
import type { EventRecord } from "@/lib/types";

/**
 * The block at the top of the homepage, showing whichever event is Featured.
 *
 * The name, tagline, date, location and photograph all come from the event
 * record. Hardcoding "Sun Club" here meant the headline kept naming last
 * month's event after somebody featured a new one, with no indication anything
 * was wrong.
 *
 * The eyebrow and body stay editable content: the eyebrow is brand framing
 * rather than event detail, and the body is deliberately not the event summary,
 * which already appears in full in the series intro below. Saying the same
 * paragraph twice on one page reads as a mistake.
 */
export function Hero({
  content = hero,
  event = null,
}: {
  content?: typeof hero;
  event?: EventRecord | null;
} = {}) {
  const title = event?.name?.trim() || content.title;
  const tagline = event?.tagline?.trim() || content.tagline;
  const location = event?.location?.trim() || content.location;
  const date = event?.date?.trim() || content.date;
  const image = event?.image ?? content.image;
  const imageAlt = event?.imageAlt?.trim() || content.imageAlt;
  const shotNote = event?.shotNote?.trim() || content.shotNote;

  /**
   * The paragraph belongs to the event, full stop.
   *
   * Every event has a hero, because every event can be the featured one, so
   * this is written on the event like its name and its tagline. `content.body`
   * is only what shows when nothing is featured at all, and it is not editable
   * as page content for the same reason hero.title and hero.date are not: two
   * places to change one thing is how the hero ends up describing last month.
   */
  const ownBody = event?.heroBody?.trim();
  const body = ownBody || content.body;
  // A featured event with no paragraph of its own silently borrows the series
  // line, which is about Sun Club rather than about this night. Worth saying so
  // where somebody is looking at it.
  const borrowingDefault = Boolean(event) && !ownBody;
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="on-dark bg-deep text-bone relative isolate flex min-h-[92svh] flex-col justify-end overflow-hidden"
    >
      {/* Backdrop: the featured event's photograph, or its designed gradient */}
      <div className="absolute inset-0 -z-10">
        <Media
          tone="dusk"
          src={image}
          alt={imageAlt}
          shotNote={shotNote}
          hideNote
          priority
          sizes="100vw"
          overlay="strong"
          className="h-full w-full"
        />
        {/* Warm light off the low sun, breathing very slowly */}
        <div
          aria-hidden="true"
          className="animate-glow absolute right-[-12%] bottom-[-16%] h-[62%] w-[70%] sm:w-[56%]"
          style={{
            backgroundImage:
              "radial-gradient(closest-side, rgba(255,196,96,0.22), rgba(255,171,74,0.10) 50%, rgba(255,171,74,0) 76%)",
          }}
        />
      </div>

      <div className="shell w-full pt-32 pb-10 sm:pt-36 lg:pb-14">
        <div className="max-w-4xl">
          <p
            className="animate-rise label-sm text-sun-soft"
            style={{ ["--rise-delay" as string]: "80ms" }}
          >
            {PRESENTS}
          </p>

          <h1
            id="hero-title"
            className="animate-rise font-display mt-6 leading-[0.88] font-semibold tracking-[-0.02em] uppercase"
            style={{
              fontSize: "clamp(3.25rem, 12.5vw, 10rem)",
              ["--rise-delay" as string]: "160ms",
            }}
          >
            {title}
          </h1>

          <p
            className="animate-rise font-display text-bone/90 mt-7 text-[1.6rem] leading-tight sm:text-[2.1rem]"
            style={{ ["--rise-delay" as string]: "260ms" }}
          >
            {tagline}
          </p>

          <p
            className="animate-rise text-bone/70 mt-6 max-w-xl text-[1.0625rem] leading-relaxed"
            style={{ ["--rise-delay" as string]: "340ms" }}
          >
            {body}
          </p>

          <EditNotice kind={borrowingDefault ? "heroDefaultBody" : "hero"} />

          <div
            className="animate-rise mt-10 flex flex-wrap items-center gap-3"
            style={{ ["--rise-delay" as string]: "420ms" }}
          >
            <ButtonLink href={content.primaryCta.href} variant="sun" size="lg">
              <Editable path="hero.primaryCta.label">
                {content.primaryCta.label}
              </Editable>
              <ArrowIcon />
            </ButtonLink>
            <ButtonLink
              href={content.secondaryCta.href}
              variant="outline"
              size="lg"
              className="text-bone"
            >
              <Editable path="hero.secondaryCta.label">
                {content.secondaryCta.label}
              </Editable>
            </ButtonLink>
            <ButtonLink
              href="/rsvp"
              variant="ghost"
              size="lg"
              className="text-bone/80 hover:text-bone"
            >
              <Editable path="hero.rsvpCta">{content.rsvpCta}</Editable>
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* Meta rail */}
      <div className="shell w-full pb-8">
        <div className="border-bone/15 flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <dl className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="bg-sun h-1.5 w-1.5 rounded-full"
              />
              <dt className="sr-only">Location</dt>
              <dd className="label-xs text-bone/75">{location}</dd>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="bg-bone/40 h-1.5 w-1.5 rounded-full"
              />
              <dt className="sr-only">Next date</dt>
              <dd className="label-xs text-bone/75">{date}</dd>
            </div>
          </dl>

          <a
            href="#events"
            className="group text-bone/60 hover:text-bone flex items-center gap-3 self-start transition-colors duration-200 sm:self-auto"
          >
            <span className="label-xs">Upcoming events</span>
            <span
              aria-hidden="true"
              className="border-bone/25 group-hover:border-bone/60 flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <path
                  d="M8 3v10M4 9l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

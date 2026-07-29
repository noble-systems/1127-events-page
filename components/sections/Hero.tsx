import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { hero } from "@/content/site";

export function Hero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="on-dark bg-deep text-bone relative isolate flex min-h-[92svh] flex-col justify-end overflow-hidden"
    >
      {/* Backdrop, swap `hero.image` in content/site.ts for real footage stills */}
      <div className="absolute inset-0 -z-10">
        <Media
          tone="dusk"
          src={hero.image}
          alt={hero.imageAlt}
          shotNote={hero.shotNote}
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
            {hero.eyebrow}
          </p>

          <h1
            id="hero-title"
            className="animate-rise font-display mt-6 leading-[0.88] font-semibold tracking-[-0.02em] uppercase"
            style={{
              fontSize: "clamp(3.25rem, 12.5vw, 10rem)",
              ["--rise-delay" as string]: "160ms",
            }}
          >
            {hero.title}
          </h1>

          <p
            className="animate-rise font-display text-bone/90 mt-7 text-[1.6rem] leading-tight sm:text-[2.1rem]"
            style={{ ["--rise-delay" as string]: "260ms" }}
          >
            {hero.tagline}
          </p>

          <p
            className="animate-rise text-bone/70 mt-6 max-w-xl text-[1.0625rem] leading-relaxed"
            style={{ ["--rise-delay" as string]: "340ms" }}
          >
            {hero.body}
          </p>

          <div
            className="animate-rise mt-10 flex flex-wrap items-center gap-3"
            style={{ ["--rise-delay" as string]: "420ms" }}
          >
            <ButtonLink href={hero.primaryCta.href} variant="sun" size="lg">
              {hero.primaryCta.label}
              <ArrowIcon />
            </ButtonLink>
            <ButtonLink
              href={hero.secondaryCta.href}
              variant="outline"
              size="lg"
              className="text-bone"
            >
              {hero.secondaryCta.label}
            </ButtonLink>
            <ButtonLink
              href="/rsvp"
              variant="ghost"
              size="lg"
              className="text-bone/80 hover:text-bone"
            >
              RSVP
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
              <dd className="label-xs text-bone/75">{hero.location}</dd>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="bg-bone/40 h-1.5 w-1.5 rounded-full"
              />
              <dt className="sr-only">Next date</dt>
              <dd className="label-xs text-bone/75">{hero.date}</dd>
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

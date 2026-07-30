import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import type { EventRecord } from "@/lib/types";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-ink/10 flex items-baseline justify-between gap-4 border-t py-2.5">
      <dt className="label-xs text-ink/65">{label}</dt>
      <dd className="text-ink/85 text-right text-[0.875rem] font-medium">
        {value}
      </dd>
    </div>
  );
}

function Tags({ tags }: { tags: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li
          key={tag}
          className="border-ink/15 text-ink/70 rounded-full border px-3 py-1.5 text-[0.8125rem]"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

/**
 * EventCard
 * ---------
 * Reusable for every 1127 concept. Events are created in the admin dashboard
 * and rendered here, no component changes needed to add one.
 */
export function EventCard({ event }: { event: EventRecord }) {
  const featured = event.featured;
  const rsvp = event.ctaAction === "rsvp";

  const cta = (
    <ButtonLink
      // Carries which event drew them, so the signup can be attributed and
      // their genre affinity recorded. See lib/genres.ts.
      href={rsvp ? `/rsvp?event=${encodeURIComponent(event.id)}` : "/partner"}
      variant={rsvp ? "primary" : "outline"}
      size={featured ? "lg" : "md"}
    >
      {event.ctaLabel}
      <ArrowIcon />
    </ButtonLink>
  );

  return (
    <article
      className={`group border-ink/10 bg-bone-soft hover:border-ink/25 relative flex h-full flex-col overflow-hidden rounded-3xl border transition-[border-color,box-shadow,transform] duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_28px_60px_-40px_rgba(7,20,47,0.5)] ${
        featured ? "lg:flex-row" : ""
      }`}
    >
      <div
        className={
          featured
            ? "relative aspect-[16/11] w-full shrink-0 sm:aspect-[16/9] lg:aspect-auto lg:w-[46%]"
            : "relative aspect-[16/11] w-full"
        }
      >
        <Media
          tone={event.tone}
          src={event.image}
          alt={event.imageAlt}
          shotNote={event.shotNote}
          sizes={
            featured
              ? "(max-width: 1024px) 100vw, 42vw"
              : "(max-width: 1024px) 100vw, 30vw"
          }
          className="h-full w-full"
        />
        <span className="bg-bone/92 text-ink absolute top-4 left-4 z-[4] rounded-full px-3 py-1.5 text-[0.75rem] font-medium tracking-[0.14em] uppercase backdrop-blur-sm">
          {event.status}
        </span>
      </div>

      <div
        className={`flex flex-1 flex-col p-6 sm:p-8 ${featured ? "lg:p-10" : ""}`}
      >
        <p className="label-xs text-ink/65">{event.series}</p>

        <h3
          className={`mt-3 leading-[1.02] ${
            featured ? "text-4xl sm:text-5xl" : "text-3xl"
          }`}
        >
          {event.name}
        </h3>

        <p
          className={`font-display text-ink/70 mt-3 ${
            featured ? "text-xl" : "text-lg"
          }`}
        >
          {event.tagline}
        </p>

        <p className="text-ink/65 mt-4 text-[0.9375rem] leading-relaxed">
          {event.summary}
        </p>

        <div className="mt-6">
          <Tags tags={event.tags} />
        </div>

        <dl className="mt-7">
          <MetaRow label="Date" value={event.date} />
          <MetaRow label="Location" value={event.location} />
          {event.venue ? (
            <MetaRow label="Venue" value={event.venue} />
          ) : (
            <MetaRow label="Venue" value="Announcing soon" />
          )}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3 pt-1">{cta}</div>
      </div>
    </article>
  );
}

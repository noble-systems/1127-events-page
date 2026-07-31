import { Editable } from "@/components/edit/Editable";
import { EventCard } from "@/components/EventCard";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "@/components/ui/Section";
import { facts, upcoming } from "@/content/site";
import type { EventRecord } from "@/lib/types";

function Facts() {
  return (
    <dl className="border-ink/10 bg-ink/10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border lg:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.label} className="bg-bone px-5 py-6 sm:px-6">
          <dt className="sr-only">{fact.label}</dt>
          <dd>
            <span className="font-display block text-2xl leading-none sm:text-3xl">
              {fact.value}
            </span>
            <span className="text-ink/65 mt-2.5 block text-[0.8125rem] leading-snug">
              {fact.label}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function UpcomingEvents({
  events,
  copy = upcoming,
}: {
  events: EventRecord[];
  copy?: typeof upcoming;
}) {
  return (
    <Section id="events" tone="bone" size="lg" labelledBy="events-title">
      <SectionHeader
        id="events-title"
        eyebrow={<Editable path="upcoming.eyebrow">{copy.eyebrow}</Editable>}
        title={<Editable path="upcoming.title">{copy.title}</Editable>}
        intro={<Editable path="upcoming.intro">{copy.intro}</Editable>}
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {events.map((event, index) => (
          <Reveal
            key={event.id}
            delay={index * 90}
            className={event.featured ? "lg:col-span-2" : ""}
          >
            <EventCard event={event} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={120} className="mt-14">
        <Facts />
      </Reveal>
    </Section>
  );
}

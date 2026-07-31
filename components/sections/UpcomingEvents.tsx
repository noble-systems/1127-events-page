import { EditAdd, EditPair, Editable } from "@/components/edit/Editable";
import { EventCard } from "@/components/EventCard";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "@/components/ui/Section";
import { facts, upcoming } from "@/content/site";
import type { EventRecord } from "@/lib/types";

function Facts({ rows }: { rows: typeof facts }) {
  return (
    <>
      <dl className="border-ink/10 bg-ink/10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border lg:grid-cols-4">
        {/*
          Term before definition in the DOM, reversed visually so the figure
          still sits above its caption. The caption used to be rendered twice,
          once screen-reader-only as the term and once visibly inside the
          definition, which read the same words to a screen reader twice and
          gave the editor two copies of one string to disagree about.
        */}
        {rows.map((fact, index) => (
          <div
            key={fact.label || index}
            className="bg-bone flex flex-col-reverse px-5 py-6 sm:px-6"
          >
            <dt className="text-ink/65 mt-2.5 text-[0.8125rem] leading-snug">
              <EditPair path="facts" index={index} part="right">
                {fact.label}
              </EditPair>
            </dt>
            <dd className="font-display text-2xl leading-none sm:text-3xl">
              <EditPair path="facts" index={index} part="left">
                {fact.value}
              </EditPair>
            </dd>
          </div>
        ))}
      </dl>
      <EditAdd path="facts" variant="row" />
    </>
  );
}

export function UpcomingEvents({
  events,
  copy = upcoming,
  factRows = facts,
}: {
  events: EventRecord[];
  copy?: typeof upcoming;
  factRows?: typeof facts;
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
        <Facts rows={factRows} />
      </Reveal>
    </Section>
  );
}

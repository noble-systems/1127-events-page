import { EditAdd, EditItem, EditPair, Editable } from "@/components/edit/Editable";
import { EditNotice } from "@/components/edit/EditNotice";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { sunClub, PRESENTS } from "@/content/site";
import type { EventRecord } from "@/lib/types";

/**
 * The series intro, driven by whichever event is marked Featured.
 *
 * This section used to be a second, separate copy of the event's own wording in
 * content/site.ts, which meant changing the featured event in the dashboard left
 * the intro talking about the old one. Now there is one source of truth: mark an
 * event featured and this follows it.
 *
 * The static copy remains the fallback for anything the event does not carry, so
 * the section still reads properly before any event exists and while fields are
 * being filled in. `details` stays editorial: it describes the format of the
 * series rather than a single date, and events have no equivalent field.
 */
export function SunClubIntro({
  content = sunClub,
  event = null,
}: {
  content?: typeof sunClub;
  event?: EventRecord | null;
} = {}) {
  // Always the company line. See PRESENTS.
  const eyebrow = PRESENTS;
  // Deliberately NOT the event's name or tagline: both are already large on
  // screen in the hero directly above. This heading is the editorial line about
  // the series, and it stays editable in the dashboard.
  const title = content.title;
  const paragraphs = event?.summary?.trim()
    ? [event.summary.trim()]
    : content.paragraphs;
  const image = event?.image ?? content.image;
  const imageAlt = event?.imageAlt?.trim() || content.imageAlt;
  const shotNote = event?.shotNote?.trim() || content.shotNote;

  // Date, location and venue come from the event when there is one, so they can
  // never contradict the card for the same event further up the page.
  const details = event
    ? [
        { label: "Date", value: event.date },
        { label: "Setting", value: event.location },
        ...(event.venue ? [{ label: "Venue", value: event.venue }] : []),
        ...content.details.filter(
          (d) => !["Date", "Setting", "Venue"].includes(d.label),
        ),
      ]
    : content.details;

  return (
    <Section id="sun-club" tone="sand" size="lg" labelledBy="sun-club-title">
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl sm:aspect-[3/2] lg:aspect-[4/5]">
              <Media
                tone="pool"
                src={image}
                alt={imageAlt}
                shotNote={shotNote}
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="h-full w-full"
              />
            </div>
          </Reveal>

          <EditNotice kind="seriesPhoto" />
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h2
              id="sun-club-title"
              className="mt-5 text-[2.1rem] leading-[1.05] sm:text-5xl lg:text-[3.4rem]"
            >
              <Editable path="sunClub.title">{title}</Editable>
            </h2>
          </Reveal>

          {paragraphs.map((paragraph, index) => (
            <Reveal key={index} delay={110 + index * 60}>
              <p className="text-ink/70 mt-6 text-[1.0625rem] leading-relaxed">
                <EditItem path="sunClub.paragraphs" index={index}>
                  {paragraph}
                </EditItem>
              </p>
            </Reveal>
          ))}
          <EditAdd path="sunClub.paragraphs" variant="paragraph" />

          <Reveal delay={240}>
            <dl className="border-ink/15 mt-10 border-t">
              {details.map((detail, index) => (
                <div
                  key={detail.label || index}
                  className="border-ink/15 flex flex-col gap-1 border-b py-4 sm:flex-row sm:items-baseline sm:gap-8"
                >
                  <dt className="label-xs text-ink/65 w-28 shrink-0">
                    <EditPair path="sunClub.details" index={index} part="left">
                      {detail.label}
                    </EditPair>
                  </dt>
                  <dd className="text-ink/85 text-[0.9375rem]">
                    <EditPair path="sunClub.details" index={index} part="right">
                      {detail.value}
                    </EditPair>
                  </dd>
                </div>
              ))}
              <EditAdd path="sunClub.details" variant="row" />
            </dl>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ButtonLink href="/rsvp" variant="primary" size="lg">
                RSVP for Sun Club
                <ArrowIcon />
              </ButtonLink>
              <ButtonLink href="#ambassadors" variant="outline" size="lg">
                Ambassador program
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

/**
 * ARCHIVED, deliberately unmounted. Do not delete.
 *
 * Eight placeholder tiles and a recap-film badge with no footage behind any of
 * them sold nothing; the section is parked until real photography exists.
 *
 * To bring it back:
 *   1. In components/HomeSections.tsx, import MediaGrid and render
 *      <MediaGrid section={content.mediaSection} slots={content.mediaSlots} />
 *      between Ambassadors and Partner.
 *   2. Restore the "media" group in lib/content-schema.ts (git history, commit
 *      that archived it) so the tiles are editable again.
 *   3. Re-check the homepage tone alternation: this section is deep, so its
 *      neighbours should be light.
 *
 * It stays in the tree rather than only in git so the type checker keeps it
 * compiling against current props while it waits.
 */
import { Editable } from "@/components/edit/Editable";
import { EditableImage } from "@/components/edit/EditableImage";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "@/components/ui/Section";
import { mediaSection, mediaSlots, type MediaSlot } from "@/content/site";

const SPAN: Record<MediaSlot["span"], string> = {
  wide: "sm:col-span-8",
  tall: "sm:col-span-4",
  square: "sm:col-span-4",
  standard: "sm:col-span-6",
  full: "sm:col-span-12",
};

const ASPECT: Record<MediaSlot["span"], string> = {
  wide: "aspect-[16/10]",
  tall: "aspect-[4/5]",
  square: "aspect-square",
  standard: "aspect-[4/3]",
  full: "aspect-[16/9] sm:aspect-[21/9]",
};

const SIZES: Record<MediaSlot["span"], string> = {
  wide: "(max-width: 640px) 100vw, 62vw",
  tall: "(max-width: 640px) 100vw, 31vw",
  square: "(max-width: 640px) 100vw, 31vw",
  standard: "(max-width: 640px) 100vw, 46vw",
  full: "100vw",
};

function PlayBadge({ label }: { label: string }) {
  return (
    <span className="bg-deep/70 text-bone absolute top-4 left-4 z-[4] flex items-center gap-2.5 rounded-full py-2 pr-4 pl-2 backdrop-blur-sm">
      <span className="bg-sun text-ink flex h-6 w-6 items-center justify-center rounded-full">
        <svg
          viewBox="0 0 12 12"
          fill="currentColor"
          aria-hidden="true"
          className="h-3 w-3"
        >
          <path d="M4 2.5v7l6-3.5-6-3.5Z" />
        </svg>
      </span>
      <span className="label-xs">{label}</span>
    </span>
  );
}

export function MediaGrid({
  section = mediaSection,
  slots = mediaSlots,
}: {
  section?: typeof mediaSection;
  slots?: typeof mediaSlots;
} = {}) {
  return (
    <Section tone="deep" size="lg" labelledBy="media-title">
      <SectionHeader
        id="media-title"
        eyebrow={
          <Editable path="mediaSection.eyebrow">{section.eyebrow}</Editable>
        }
        title={<Editable path="mediaSection.title">{section.title}</Editable>}
        intro={<Editable path="mediaSection.intro">{section.intro}</Editable>}
      />

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-12 sm:gap-5">
        {slots.map((slot, index) => (
          <Reveal
            key={slot.id}
            delay={Math.min(index, 5) * 70}
            className={SPAN[slot.span]}
          >
            <EditableImage
              path={`mediaSlots.${index}.image`}
              altPath={`mediaSlots.${index}.imageAlt`}
              className={`w-full overflow-hidden rounded-2xl ${ASPECT[slot.span]}`}
            >
              <Media
                tone={slot.tone}
                src={slot.image}
                alt={slot.imageAlt}
                shotNote={slot.shotNote}
                sizes={SIZES[slot.span]}
                className="h-full w-full"
              />
              {slot.badge ? <PlayBadge label={slot.badge} /> : null}
            </EditableImage>
          </Reveal>
        ))}
      </div>

      <Reveal delay={100}>
        <p className="text-bone/55 mt-10 max-w-2xl text-[0.9375rem] leading-relaxed">
          Photo and video are part of the deal, not an upsell. Venue partners
          receive the edited assets from every date and appear throughout the
          distribution.
        </p>
      </Reveal>
    </Section>
  );
}

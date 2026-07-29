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

export function MediaGrid() {
  return (
    <Section tone="deep" size="lg" labelledBy="media-title">
      <SectionHeader
        id="media-title"
        eyebrow={mediaSection.eyebrow}
        title={mediaSection.title}
        intro={mediaSection.intro}
      />

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-12 sm:gap-5">
        {mediaSlots.map((slot, index) => (
          <Reveal
            key={slot.id}
            delay={Math.min(index, 5) * 70}
            className={SPAN[slot.span]}
          >
            <div
              className={`relative w-full overflow-hidden rounded-2xl ${ASPECT[slot.span]}`}
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
            </div>
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

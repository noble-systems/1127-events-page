import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { toneBackground } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "@/components/ui/Section";
import { capabilities, capabilitiesSection } from "@/content/site";

export function Capabilities() {
  return (
    <Section
      id="what-we-do"
      tone="ink"
      size="lg"
      labelledBy="what-we-do-title"
      className="overflow-hidden"
      backdrop={
        /* Warm horizon glow along the top edge */
        <div
          className="absolute inset-x-0 top-0 h-80"
          style={{
            backgroundImage:
              "radial-gradient(70% 100% at 50% 0%, rgba(224,166,60,0.16), rgba(224,166,60,0) 70%)",
          }}
        />
      }
    >
      <div>
        <SectionHeader
          id="what-we-do-title"
          eyebrow={capabilitiesSection.eyebrow}
          title={capabilitiesSection.title}
        />

        <ol className="border-bone/15 mt-16 border-t">
          {capabilities.map((capability, index) => (
            <Reveal
              key={capability.id}
              as="li"
              delay={Math.min(index, 4) * 60}
              className="border-bone/15 block border-b"
            >
              <div className="grid gap-6 py-10 lg:grid-cols-12 lg:gap-10 lg:py-12">
                <div className="flex items-start gap-4 lg:col-span-4">
                  <span
                    aria-hidden="true"
                    className="ring-bone/20 mt-1 h-9 w-9 shrink-0 rounded-lg ring-1"
                    style={{ backgroundImage: toneBackground(capability.tone) }}
                  />
                  <div>
                    <span className="label-xs text-sun/80 block">
                      {capability.index}
                    </span>
                    <h3 className="mt-2.5 text-2xl leading-tight sm:text-[1.75rem]">
                      {capability.title}
                    </h3>
                  </div>
                </div>

                <div className="lg:col-span-8">
                  <p className="font-display text-bone text-xl leading-snug sm:text-2xl">
                    {capability.lead}
                  </p>
                  <p className="text-bone/60 mt-4 max-w-2xl text-[0.9375rem] leading-relaxed">
                    {capability.body}
                  </p>

                  <ul className="mt-6 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                    {capability.points.map((point) => (
                      <li
                        key={point}
                        className="text-bone/75 flex items-start gap-2.5 text-[0.875rem]"
                      >
                        <span
                          aria-hidden="true"
                          className="bg-sun/70 mt-[0.55em] h-1 w-1 shrink-0 rounded-full"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={80}>
          <div className="border-bone/15 bg-bone/[0.04] mt-14 flex flex-col gap-6 rounded-3xl border p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <p className="font-display text-bone max-w-xl text-xl leading-snug sm:text-2xl">
              The venue handles hospitality, bar, security and its guests. We handle
              everything that fills the room and everything that makes a sound.
            </p>
            <ButtonLink
              href="/partner"
              variant="sun"
              size="lg"
              className="shrink-0 self-start sm:self-auto"
            >
              Partner With 1127
              <ArrowIcon />
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

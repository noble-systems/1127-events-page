import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { sunClub } from "@/content/site";

export function SunClubIntro({
  content = sunClub,
}: {
  content?: typeof sunClub;
} = {}) {
  return (
    <Section id="sun-club" tone="sand" size="lg" labelledBy="sun-club-title">
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl sm:aspect-[3/2] lg:aspect-[4/5]">
              <Media
                tone="pool"
                src={content.image}
                alt={content.imageAlt}
                shotNote={content.shotNote}
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="h-full w-full"
              />
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <Reveal>
            <Eyebrow>{content.eyebrow}</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h2
              id="sun-club-title"
              className="mt-5 text-[2.1rem] leading-[1.05] sm:text-5xl lg:text-[3.4rem]"
            >
              {content.title}
            </h2>
          </Reveal>

          {content.paragraphs.map((paragraph, index) => (
            <Reveal key={index} delay={110 + index * 60}>
              <p className="text-ink/70 mt-6 text-[1.0625rem] leading-relaxed">
                {paragraph}
              </p>
            </Reveal>
          ))}

          <Reveal delay={240}>
            <dl className="border-ink/15 mt-10 border-t">
              {content.details.map((detail) => (
                <div
                  key={detail.label}
                  className="border-ink/15 flex flex-col gap-1 border-b py-4 sm:flex-row sm:items-baseline sm:gap-8"
                >
                  <dt className="label-xs text-ink/65 w-28 shrink-0">
                    {detail.label}
                  </dt>
                  <dd className="text-ink/85 text-[0.9375rem]">{detail.value}</dd>
                </div>
              ))}
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

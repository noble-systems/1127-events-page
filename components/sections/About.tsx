import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { about, brand } from "@/content/site";

export function About() {
  return (
    <Section id="about" tone="bone" size="lg" labelledBy="about-title">
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <Reveal>
            <Eyebrow>{about.eyebrow}</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h2
              id="about-title"
              className="mt-5 text-[2.1rem] leading-[1.04] sm:text-5xl lg:text-[3.5rem]"
            >
              {about.title}
            </h2>
          </Reveal>

          {about.paragraphs.map((paragraph, index) => (
            <Reveal key={index} delay={110 + index * 55}>
              <p className="text-ink/70 mt-6 max-w-2xl text-[1.0625rem] leading-relaxed">
                {paragraph}
              </p>
            </Reveal>
          ))}

          <Reveal delay={280}>
            <div className="border-ink/15 mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 border-t pt-8">
              <div>
                <p className="font-display text-3xl leading-none">~30 years</p>
                <p className="text-ink/65 mt-2 text-[0.8125rem]">
                  Combined event-production experience
                </p>
              </div>
              <div>
                <p className="font-display text-3xl leading-none">Arizona</p>
                <p className="text-ink/65 mt-2 text-[0.8125rem]">
                  Based in {brand.city}
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-5">
          <Reveal delay={140}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl lg:aspect-[4/5]">
              <Media
                tone="ink"
                src={about.image}
                alt={about.imageAlt}
                shotNote={about.shotNote}
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="h-full w-full"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

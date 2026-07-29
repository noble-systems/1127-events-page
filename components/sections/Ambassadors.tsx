import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { ambassadors } from "@/content/site";

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="text-sun-deep mt-[0.15em] h-4 w-4 shrink-0"
    >
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Ambassadors() {
  return (
    <Section id="ambassadors" tone="bone" size="lg" labelledBy="ambassadors-title">
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6">
          <Reveal>
            <Eyebrow>{ambassadors.eyebrow}</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h2
              id="ambassadors-title"
              className="mt-5 text-[2.1rem] leading-[1.04] sm:text-5xl lg:text-[3.75rem]"
            >
              {ambassadors.title}
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <p className="text-ink/70 mt-6 max-w-xl text-[1.0625rem] leading-relaxed">
              {ambassadors.intro}
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-10">
              <h3 className="label-sm text-ink/65">{ambassadors.doTitle}</h3>
              <ul className="mt-4 space-y-2.5">
                {ambassadors.does.map((item) => (
                  <li
                    key={item}
                    className="text-ink/80 flex items-start gap-3 text-[0.9375rem]"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-terracotta mt-[0.6em] h-1 w-1 shrink-0 rounded-full"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10">
              <h3 className="label-sm text-ink/65">{ambassadors.forTitle}</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {ambassadors.communities.map((community) => (
                  <li
                    key={community}
                    className="border-ink/15 bg-bone-soft text-ink/75 rounded-full border px-3.5 py-2 text-[0.8125rem]"
                  >
                    {community}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-6">
          <Reveal delay={100}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl sm:aspect-[16/10]">
              <Media
                tone="terracotta"
                src={ambassadors.image}
                alt={ambassadors.imageAlt}
                shotNote={ambassadors.shotNote}
                sizes="(max-width: 1024px) 100vw, 46vw"
                className="h-full w-full"
              />
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="border-ink/12 bg-sand/70 mt-6 rounded-3xl border p-7 sm:p-9">
              <h3 className="label-sm text-ink/65">{ambassadors.benefitsTitle}</h3>
              <ul className="mt-5 space-y-3">
                {ambassadors.benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="text-ink/80 flex items-start gap-3 text-[0.9375rem] leading-relaxed"
                  >
                    <CheckIcon />
                    {benefit}
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <ButtonLink
                  href="/opportunities#ambassador"
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {ambassadors.cta}
                  <ArrowIcon />
                </ButtonLink>
                <p className="text-ink/65 mt-4 text-[0.8125rem] leading-relaxed">
                  A short application. We review before every date and reach out
                  directly.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

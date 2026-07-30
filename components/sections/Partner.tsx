import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { partner } from "@/content/site";

/**
 * Home-page teaser. The full pitch and the inquiry form live on /partner so
 * there's one linkable destination for venue and brand conversations.
 */
export function Partner({
  content = partner,
}: {
  content?: typeof partner;
} = {}) {
  return (
    <Section id="partner" tone="sand" size="lg" labelledBy="partner-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>{content.eyebrow}</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h2
              id="partner-title"
              className="mt-5 text-[2.1rem] leading-[1.04] sm:text-5xl lg:text-[3.5rem]"
            >
              {content.title}
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <p className="text-ink/70 mt-6 text-[1.0625rem] leading-relaxed">
              {content.intro}
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/partner" variant="primary" size="lg">
                {content.cta}
                <ArrowIcon />
              </ButtonLink>
              <ButtonLink href="/opportunities" variant="outline" size="lg">
                Work with us
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <Reveal delay={100}>
            <dl className="border-ink/15 border-t">
              {content.brings.map((item) => (
                <div
                  key={item.title}
                  className="border-ink/15 flex flex-col gap-1 border-b py-3.5 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <dt className="text-ink w-48 shrink-0 text-[0.9375rem] font-medium">
                    {item.title}
                  </dt>
                  <dd className="text-ink/65 text-[0.875rem]">{item.body}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

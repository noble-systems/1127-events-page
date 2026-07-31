import { Editable } from "@/components/edit/Editable";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Section } from "@/components/ui/Section";
import { finalCta } from "@/content/site";

export function FinalCta({
  content = finalCta,
}: {
  content?: typeof finalCta;
} = {}) {
  return (
    <Section
      tone="ink"
      size="lg"
      labelledBy="final-cta-title"
      className="overflow-hidden"
      backdrop={
        <div
          className="absolute inset-x-0 bottom-0 h-96"
          style={{
            backgroundImage:
              "radial-gradient(60% 100% at 50% 100%, rgba(224,166,60,0.20), rgba(224,166,60,0) 70%)",
          }}
        />
      }
    >
      <h2 id="final-cta-title" className="sr-only">
        Get involved with 1127 Events
      </h2>

      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        {/* Guests */}
        <Reveal>
          <div className="border-bone/15 bg-bone/[0.04] flex h-full flex-col rounded-3xl border p-8 sm:p-10">
            <p className="label-xs text-sun/80">{<Editable path="finalCta.guests.eyebrow">{content.guests.eyebrow}</Editable>}</p>
            <h3 className="mt-5 text-[2rem] leading-[1.06] sm:text-[2.6rem]">
              {<Editable path="finalCta.guests.title">{content.guests.title}</Editable>}
            </h3>
            <p className="text-bone/65 mt-4 max-w-sm text-[0.9375rem] leading-relaxed">
              {<Editable path="finalCta.guests.body">{content.guests.body}</Editable>}
            </p>
            <div className="mt-auto pt-8">
              <ButtonLink
                href="/rsvp"
                variant="sun"
                size="lg"
                className="w-full sm:w-auto"
              >
                {<Editable path="finalCta.guests.cta">{content.guests.cta}</Editable>}
                <ArrowIcon />
              </ButtonLink>
            </div>
          </div>
        </Reveal>

        {/* Partners */}
        <Reveal delay={90}>
          <div className="border-bone/15 bg-bone/[0.04] flex h-full flex-col rounded-3xl border p-8 sm:p-10">
            <p className="label-xs text-bone/60">{<Editable path="finalCta.partners.eyebrow">{content.partners.eyebrow}</Editable>}</p>
            <h3 className="mt-5 text-[2rem] leading-[1.06] sm:text-[2.6rem]">
              {<Editable path="finalCta.partners.title">{content.partners.title}</Editable>}
            </h3>
            <p className="text-bone/65 mt-4 max-w-sm text-[0.9375rem] leading-relaxed">
              {<Editable path="finalCta.partners.body">{content.partners.body}</Editable>}
            </p>
            <div className="mt-auto pt-8">
              <ButtonLink
                href="/partner"
                variant="outline"
                size="lg"
                className="text-bone w-full sm:w-auto"
              >
                {<Editable path="finalCta.partners.cta">{content.partners.cta}</Editable>}
                <ArrowIcon />
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { InquiryForm } from "@/components/forms/InquiryForm";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { capabilities, partner } from "@/content/site";

const title = "Partner With 1127";
const description =
  "1127 Events brings the audience, paid marketing, local talent, media and technical production to your venue. You handle hospitality, bar and security, we handle the rest.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/partner" },
  openGraph: {
    title: `${title}, 1127 Events`,
    description,
    url: "/partner",
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function PartnerPage() {
  return (
    <>
      <SiteHeader overlay={false} />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        {/* ---------------------------------------------------------------- */}
        {/* Pitch + form                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="partner-title"
          className="bg-deep text-bone relative isolate overflow-hidden"
        >
          <div className="absolute inset-0 -z-10">
            <Media
              tone="cobalt"
              hideNote
              priority
              sizes="100vw"
              overlay="strong"
              className="h-full w-full"
            />
          </div>

          <div className="shell grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-16">
            <div className="on-dark lg:col-span-5">
              <Eyebrow className="text-sun-soft">{partner.eyebrow}</Eyebrow>

              <h1
                id="partner-title"
                className="font-display mt-6 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.02em] sm:text-5xl lg:text-6xl"
              >
                {partner.title}
              </h1>

              <p className="text-bone/75 mt-6 text-[1.0625rem] leading-relaxed">
                {partner.intro}
              </p>

              <dl className="border-bone/20 mt-10 border-t">
                {partner.brings.map((item) => (
                  <div
                    key={item.title}
                    className="border-bone/20 flex flex-col gap-1 border-b py-3.5 sm:flex-row sm:items-baseline sm:gap-6"
                  >
                    <dt className="text-bone w-48 shrink-0 text-[0.9375rem] font-medium">
                      {item.title}
                    </dt>
                    <dd className="text-bone/65 text-[0.875rem]">{item.body}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-bone text-ink border-ink/10 rounded-3xl border p-6 shadow-[0_40px_90px_-50px_rgba(4,12,32,0.9)] sm:p-9">
                <h2 className="text-3xl leading-tight sm:text-4xl">
                  {partner.cta}
                </h2>
                <p className="text-ink/65 mt-3 max-w-md text-[0.9375rem] leading-relaxed">
                  Tell us who you are and what you&apos;re working with. Venues,
                  brands, artists, vendors and press all land in the same inbox.
                </p>

                <div className="mt-8">
                  <InquiryForm />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* What we actually do                                               */}
        {/* ---------------------------------------------------------------- */}
        <Section tone="bone" size="md" labelledBy="brings-title">
          <div className="max-w-3xl">
            <Reveal>
              <Eyebrow>What you get</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <h2
                id="brings-title"
                className="mt-5 text-[2rem] leading-[1.05] sm:text-4xl lg:text-[3rem]"
              >
                What you get.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="text-ink/70 mt-6 text-[1.0625rem] leading-relaxed">
                The venue focuses on hospitality, bar service, security and its
                guests. 1127 handles the entertainment, audience development, event
                marketing, technical production and media, all through one point of
                contact.
              </p>
            </Reveal>
          </div>

          <ol className="border-ink/15 mt-14 border-t">
            {capabilities.map((capability, index) => (
              <Reveal
                key={capability.id}
                as="li"
                delay={Math.min(index, 4) * 50}
                className="border-ink/15 block border-b"
              >
                <div className="grid gap-4 py-8 lg:grid-cols-12 lg:gap-10">
                  <div className="lg:col-span-4">
                    <span className="label-xs text-sun-deep block">
                      {capability.index}
                    </span>
                    <h3 className="mt-2.5 text-2xl leading-tight">
                      {capability.title}
                    </h3>
                  </div>
                  <div className="lg:col-span-8">
                    <p className="font-display text-xl leading-snug">
                      {capability.lead}
                    </p>
                    <p className="text-ink/65 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">
                      {capability.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </Section>

        {/* ---------------------------------------------------------------- */}
        {/* Cross-link                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Section tone="sand" size="sm">
          <Reveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="label-xs text-ink/65">Here to work, not to book?</p>
                <p className="font-display mt-3 max-w-xl text-xl leading-snug sm:text-2xl">
                  DJs, audio techs, promoters and crew apply through Opportunities.
                </p>
              </div>
              <ButtonLink
                href="/opportunities"
                variant="primary"
                size="lg"
                className="shrink-0 self-start sm:self-auto"
              >
                See opportunities
                <ArrowIcon />
              </ButtonLink>
            </div>
          </Reveal>
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}

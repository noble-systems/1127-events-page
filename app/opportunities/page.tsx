import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { AmbassadorForm } from "@/components/forms/AmbassadorForm";
import { TalentForm } from "@/components/forms/TalentForm";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { Media } from "@/components/ui/Media";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, Section } from "@/components/ui/Section";
import { ambassadors, opportunities } from "@/content/site";

const title = "Opportunities";
const description =
  "Apply to work with 1127 Events in Scottsdale. DJs, audio technicians, promoters, photo and video, event staff and production crew, plus the 1127 Ambassador Program.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/opportunities" },
  openGraph: {
    title: `${title}, 1127 Events`,
    description,
    url: "/opportunities",
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function OpportunitiesPage() {
  return (
    <>
      <SiteHeader overlay={false} />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        {/* ---------------------------------------------------------------- */}
        {/* Intro                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="opps-title"
          className="bg-deep text-bone relative isolate overflow-hidden"
        >
          <div className="absolute inset-0 -z-10">
            <Media
              tone="ink"
              src={opportunities.image}
              alt={opportunities.imageAlt}
              hideNote
              priority
              sizes="100vw"
              overlay="strong"
              className="h-full w-full"
            />
          </div>

          <div className="shell on-dark py-16 md:py-24">
            <div className="max-w-3xl">
              <Eyebrow className="text-sun-soft">{opportunities.eyebrow}</Eyebrow>
              <h1
                id="opps-title"
                className="font-display mt-6 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.02em] sm:text-5xl lg:text-6xl"
              >
                {opportunities.title}
              </h1>
              <p className="text-bone/75 mt-6 max-w-2xl text-[1.0625rem] leading-relaxed">
                {opportunities.intro}
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <ButtonLink href="#apply" variant="sun" size="lg">
                  Apply now
                  <ArrowIcon />
                </ButtonLink>
                <ButtonLink
                  href="#ambassador"
                  variant="outline"
                  size="lg"
                  className="text-bone"
                >
                  Ambassador program
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Roles                                                             */}
        {/* ---------------------------------------------------------------- */}
        <Section tone="bone" size="md" labelledBy="roles-title">
          <h2 id="roles-title" className="sr-only">
            Roles we book
          </h2>

          <dl className="bg-ink/12 border-ink/12 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.roles.map((role, index) => (
              <Reveal key={role.name} delay={Math.min(index, 4) * 60}>
                <div className="bg-bone h-full px-6 py-7">
                  <dt className="font-display text-xl leading-snug">{role.name}</dt>
                  <dd className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
                    {role.body}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={120}>
            <p className="text-ink/65 mt-8 max-w-2xl text-[0.9375rem] leading-relaxed">
              Not on the list? Choose{" "}
              <strong className="text-ink">Something else</strong> in the form and
              tell us what you do. That field is read by a person, not filtered by a
              keyword.
            </p>
          </Reveal>
        </Section>

        {/* ---------------------------------------------------------------- */}
        {/* Application form                                                  */}
        {/* ---------------------------------------------------------------- */}
        <Section id="apply" tone="sand" size="md" labelledBy="apply-title">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <Reveal>
                <Eyebrow>Apply</Eyebrow>
              </Reveal>
              <Reveal delay={60}>
                <h2
                  id="apply-title"
                  className="mt-5 text-[2rem] leading-[1.05] sm:text-4xl"
                >
                  Tell us what you do.
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-ink/70 mt-6 text-[1.0625rem] leading-relaxed">
                  One form for every role. It takes a couple of minutes, and the
                  last field is the one that matters.
                </p>
              </Reveal>
              <Reveal delay={180}>
                <div className="border-ink/15 mt-8 border-t pt-6">
                  <p className="text-ink/65 text-[0.875rem] leading-relaxed">
                    We keep applications on file and go back to them whenever a date
                    is confirmed. If you don&apos;t hear from us straight away it
                    isn&apos;t a no. It usually means the next date isn&apos;t
                    booked yet.
                  </p>
                </div>
              </Reveal>
            </div>

            <div className="lg:col-span-8">
              <Reveal delay={100}>
                <div className="bg-bone border-ink/12 rounded-3xl border p-6 shadow-[0_30px_70px_-50px_rgba(7,20,47,0.55)] sm:p-9">
                  <TalentForm />
                </div>
              </Reveal>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        {/* Ambassador program                                                */}
        {/* ---------------------------------------------------------------- */}
        <Section
          id="ambassador"
          tone="bone"
          size="md"
          labelledBy="ambassador-title"
        >
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <Reveal>
                <Eyebrow>{ambassadors.eyebrow}</Eyebrow>
              </Reveal>
              <Reveal delay={60}>
                <h2
                  id="ambassador-title"
                  className="mt-5 text-[2rem] leading-[1.04] sm:text-4xl lg:text-[3rem]"
                >
                  {ambassadors.title}
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-ink/70 mt-6 text-[1.0625rem] leading-relaxed">
                  {ambassadors.intro}
                </p>
              </Reveal>

              <Reveal delay={180}>
                <div className="mt-9">
                  <h3 className="label-sm text-ink/65">
                    {ambassadors.benefitsTitle}
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {ambassadors.benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="text-ink/80 flex items-start gap-3 text-[0.9375rem] leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className="bg-terracotta mt-[0.6em] h-1 w-1 shrink-0 rounded-full"
                        />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <Reveal delay={100}>
                <div className="bg-sand/60 border-ink/12 rounded-3xl border p-6 sm:p-9">
                  <h3 className="text-2xl leading-tight sm:text-3xl">
                    Apply to become an ambassador
                  </h3>
                  <p className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
                    Tell us who you are and where you&apos;re connected. We work
                    with a small group each season.
                  </p>
                  <div className="mt-7">
                    <AmbassadorForm />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        {/* Cross-link                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Section tone="ink" size="sm">
          <Reveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="label-xs text-bone/55">Run a venue or a brand?</p>
                <p className="font-display text-bone mt-3 max-w-xl text-xl leading-snug sm:text-2xl">
                  That&apos;s a different conversation, and we&apos;d like to have
                  it.
                </p>
              </div>
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
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}

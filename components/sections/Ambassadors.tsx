import { EditAdd, EditItem, Editable } from "@/components/edit/Editable";
import { EditableImage } from "@/components/edit/EditableImage";
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

export function Ambassadors({
  content = ambassadors,
}: {
  content?: typeof ambassadors;
} = {}) {
  return (
    <Section id="ambassadors" tone="bone" size="lg" labelledBy="ambassadors-title">
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6">
          <Reveal>
            <Eyebrow>
              <Editable path="ambassadors.eyebrow">{content.eyebrow}</Editable>
            </Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h2
              id="ambassadors-title"
              className="mt-5 text-[2.1rem] leading-[1.04] sm:text-5xl lg:text-[3.75rem]"
            >
              <Editable path="ambassadors.title">{content.title}</Editable>
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <p className="text-ink/70 mt-6 max-w-xl text-[1.0625rem] leading-relaxed">
              <Editable path="ambassadors.intro">{content.intro}</Editable>
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-10">
              <h3 className="label-sm text-ink/65">
                <Editable path="ambassadors.doTitle">{content.doTitle}</Editable>
              </h3>
              <ul className="group/list mt-4 space-y-2.5">
                {content.does.map((item, index) => (
                  <li
                    key={item || index}
                    className="text-ink/80 flex items-start gap-3 text-[0.9375rem]"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-terracotta mt-[0.6em] h-1 w-1 shrink-0 rounded-full"
                    />
                    <span>
                      <EditItem path="ambassadors.does" index={index}>
                        {item}
                      </EditItem>
                    </span>
                  </li>
                ))}
                <li>
                  <EditAdd path="ambassadors.does" />
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10">
              <h3 className="label-sm text-ink/65">
                <Editable path="ambassadors.forTitle">{content.forTitle}</Editable>
              </h3>
              <ul className="group/list mt-4 flex flex-wrap gap-2">
                {content.communities.map((community, index) => (
                  <li
                    key={community || index}
                    className="border-ink/15 bg-bone-soft text-ink/75 rounded-full border px-3.5 py-2 text-[0.8125rem]"
                  >
                    <EditItem path="ambassadors.communities" index={index}>
                      {community}
                    </EditItem>
                  </li>
                ))}
                <li>
                  <EditAdd path="ambassadors.communities" />
                </li>
              </ul>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-6">
          <Reveal delay={100}>
            <EditableImage
              path="ambassadors.image"
              altPath="ambassadors.imageAlt"
              className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl sm:aspect-[16/10]"
            >
              <Media
                tone="terracotta"
                src={content.image}
                alt={content.imageAlt}
                shotNote={content.shotNote}
                sizes="(max-width: 1024px) 100vw, 46vw"
                className="h-full w-full"
              />
            </EditableImage>
          </Reveal>

          <Reveal delay={160}>
            <div className="border-ink/12 bg-sand/70 mt-6 rounded-3xl border p-7 sm:p-9">
              <h3 className="label-sm text-ink/65">
                <Editable path="ambassadors.benefitsTitle">
                  {content.benefitsTitle}
                </Editable>
              </h3>
              <ul className="group/list mt-5 space-y-3">
                {content.benefits.map((benefit, index) => (
                  <li
                    key={benefit || index}
                    className="text-ink/80 flex items-start gap-3 text-[0.9375rem] leading-relaxed"
                  >
                    <CheckIcon />
                    <span>
                      <EditItem path="ambassadors.benefits" index={index}>
                        {benefit}
                      </EditItem>
                    </span>
                  </li>
                ))}
                <li>
                  <EditAdd path="ambassadors.benefits" />
                </li>
              </ul>

              <div className="mt-8">
                <ButtonLink
                  href="/opportunities#ambassador"
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <Editable path="ambassadors.cta">{content.cta}</Editable>
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

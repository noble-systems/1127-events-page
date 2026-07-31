import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

export type SectionTone = "bone" | "sand" | "ink" | "deep";

const TONE_CLASS: Record<SectionTone, string> = {
  bone: "bg-bone text-ink",
  sand: "bg-sand text-ink",
  ink: "on-dark bg-ink text-bone",
  deep: "on-dark bg-deep text-bone",
};

const PADDING = {
  sm: "py-16 md:py-20",
  md: "py-20 md:py-28",
  lg: "py-24 md:py-36",
} as const;

export function Section({
  id,
  tone = "bone",
  size = "md",
  className = "",
  innerClassName = "",
  labelledBy,
  /** Full-bleed decoration rendered behind the content, outside the shell. */
  backdrop,
  children,
}: {
  id?: string;
  tone?: SectionTone;
  size?: keyof typeof PADDING;
  className?: string;
  innerClassName?: string;
  labelledBy?: string;
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      // The live editor needs to know which sections are dark, so its editing
      // markers can switch from cobalt to the warm accent and stay visible.
      // Inert everywhere else.
      data-tone={tone}
      className={`relative isolate ${TONE_CLASS[tone]} ${PADDING[size]} ${className}`}
    >
      {backdrop ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          {backdrop}
        </div>
      ) : null}
      <div className={`shell ${innerClassName}`}>{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`label-sm flex items-center gap-3 opacity-70 ${className}`}>
      <span aria-hidden="true" className="h-px w-6 bg-current opacity-60" />
      {children}
    </p>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  intro,
  id,
  align = "left",
  className = "",
  titleClassName = "",
  children,
}: {
  // ReactNode rather than string so the live editor can pass an Editable
  // wrapper in place of the text. Outside edit mode that wrapper renders its
  // children and nothing else, so the markup here is unchanged.
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  intro?: React.ReactNode;
  id?: string;
  align?: "left" | "center";
  className?: string;
  titleClassName?: string;
  children?: ReactNode;
}) {
  return (
    <header
      className={`${align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"} ${className}`}
    >
      {eyebrow ? (
        <Reveal>
          <Eyebrow className={align === "center" ? "justify-center" : ""}>
            {eyebrow}
          </Eyebrow>
        </Reveal>
      ) : null}

      <Reveal delay={60}>
        <h2
          id={id}
          className={`mt-5 text-[2.1rem] leading-[1.06] sm:text-5xl lg:text-[3.6rem] ${titleClassName}`}
        >
          {title}
        </h2>
      </Reveal>

      {intro ? (
        <Reveal delay={120}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed opacity-75 sm:text-lg">
            {intro}
          </p>
        </Reveal>
      ) : null}

      {children}
    </header>
  );
}

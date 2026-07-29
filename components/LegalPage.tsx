import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowIcon } from "@/components/ui/Button";
import { contact } from "@/content/site";

export type LegalSection = {
  heading: string;
  body: readonly string[];
  list?: readonly string[];
};

const DOCUMENTS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/terms", label: "Terms" },
] as const;

export function LegalPage({
  title,
  intro,
  updated,
  current,
  sections,
  children,
}: {
  title: string;
  intro: string;
  /** Date this document last changed, e.g. "28 July 2026". */
  updated: string;
  current: (typeof DOCUMENTS)[number]["href"];
  sections: readonly LegalSection[];
  children?: ReactNode;
}) {
  return (
    <>
      <SiteHeader overlay={false} />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        <div className="shell py-16 md:py-24">
          <div className="max-w-2xl">
            <Link
              href="/"
              className="group label-xs text-ink/65 hover:text-ink inline-flex items-center gap-2 transition-colors duration-200"
            >
              <span aria-hidden="true" className="rotate-180">
                <ArrowIcon />
              </span>
              Back to 1127 Events
            </Link>

            <h1 className="mt-8 text-[2.4rem] leading-[1.05] sm:text-5xl">
              {title}
            </h1>

            <p className="label-xs text-ink/65 mt-5">Last updated {updated}</p>

            {/* The three documents are read together, so make that easy. */}
            <nav aria-label="Legal documents" className="mt-6">
              <ul className="flex flex-wrap gap-2">
                {DOCUMENTS.map((doc) => {
                  const active = doc.href === current;
                  return (
                    <li key={doc.href}>
                      <Link
                        href={doc.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-full px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
                          active
                            ? "bg-ink text-bone"
                            : "border-ink/20 text-ink/70 hover:border-ink/45 hover:text-ink border"
                        }`}
                      >
                        {doc.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <p className="text-ink/70 mt-8 text-[1.0625rem] leading-relaxed">
              {intro}
            </p>

            <div className="mt-12 space-y-10">
              {sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-2xl leading-tight">{section.heading}</h2>
                  {section.body.map((paragraph, index) => (
                    <p
                      key={index}
                      className="text-ink/70 mt-4 text-[0.9375rem] leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                  {section.list ? (
                    <ul className="mt-4 space-y-2">
                      {section.list.map((item) => (
                        <li
                          key={item}
                          className="text-ink/70 flex items-start gap-3 text-[0.9375rem] leading-relaxed"
                        >
                          <span
                            aria-hidden="true"
                            className="bg-ink/35 mt-[0.6em] h-1 w-1 shrink-0 rounded-full"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>

            {children}

            {/* Every one of these documents grants rights that are exercised by
                contacting us. Without a published address that is a promise the
                site cannot keep, so it is impossible to miss rather than silent. */}
            {!contact.email ? (
              <div
                role="alert"
                className="border-terracotta/45 bg-terracotta/[0.06] mt-14 rounded-2xl border border-dashed p-5"
              >
                <p className="label-xs text-terracotta-deep">
                  No contact address published
                </p>
                <p className="text-ink/75 mt-2.5 text-[0.9375rem] leading-relaxed">
                  This policy asks you to contact us to exercise your rights, but no
                  address has been set yet, so there is currently no way to do that.
                  Set <code>contact.email</code> in <code>content/site.ts</code>{" "}
                  before launch. Until then, replies to any email from us will reach
                  the team.
                </p>
              </div>
            ) : null}

            {/* Honest, and kept small: these documents describe the software
                accurately, but accuracy is not the same as legal sign-off. */}
            <div
              role="note"
              className="border-ink/15 bg-sand/50 mt-6 rounded-2xl border p-5"
            >
              <p className="text-ink/70 text-[0.875rem] leading-relaxed">
                These pages describe exactly what this website does with your
                information, and are kept in step with the code. They have not been
                reviewed by a lawyer. Before launch, have counsel check them against
                the jurisdictions 1127 operates in.
              </p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

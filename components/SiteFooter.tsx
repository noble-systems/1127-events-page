import Link from "next/link";
import { CookiePreferencesButton } from "@/components/CookieConsent";
import { Wordmark } from "@/components/Wordmark";
import { brand, contact, footer } from "@/content/site";

/**
 * Contact details stay as clearly-marked placeholders until real values are
 * added to `contact` in content/site.ts, so the footer never ships a dead
 * link or an invented address.
 */
function ContactLine({
  label,
  value,
  href,
  placeholder,
}: {
  label: string;
  value: string | null;
  href: string | null;
  placeholder: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="label-xs text-bone/55 w-24 shrink-0">{label}</span>
      {value && href ? (
        <a
          href={href}
          className="text-bone/85 hover:text-sun text-[0.9375rem] underline-offset-4 transition-colors duration-200 hover:underline"
          {...(href.startsWith("http")
            ? { target: "_blank", rel: "noreferrer noopener" }
            : {})}
        >
          {value}
        </a>
      ) : value ? (
        <span className="text-bone/85 text-[0.9375rem]">{value}</span>
      ) : (
        <span className="border-bone/25 text-bone/55 rounded-md border border-dashed px-2 py-1 text-[0.8125rem] tracking-[0.08em] uppercase">
          {placeholder}
        </span>
      )}
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="on-dark bg-deep text-bone">
      <div className="shell py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Link
              href="/"
              className="inline-block transition-opacity duration-200 hover:opacity-70"
              aria-label="1127 Events home"
            >
              <Wordmark onDark size="lg" />
            </Link>

            <p className="text-bone/60 mt-6 max-w-sm text-[0.9375rem] leading-relaxed">
              {footer.blurb}
            </p>

            <div className="mt-8 space-y-3">
              <ContactLine
                label="Location"
                value={brand.region}
                href={null}
                placeholder=""
              />
              <ContactLine
                label="Instagram"
                value={contact.instagramHandle}
                href={contact.instagramUrl}
                placeholder="Handle to be added"
              />
              <ContactLine
                label="Email"
                value={contact.email}
                href={contact.email ? `mailto:${contact.email}` : null}
                placeholder="Address to be added"
              />
            </div>
          </div>

          <nav
            aria-label="Footer"
            className="grid gap-10 sm:grid-cols-3 lg:col-span-6 lg:col-start-7"
          >
            {footer.columns.map((column) => (
              <div key={column.title}>
                <h2 className="label-xs text-bone/55">{column.title}</h2>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {link.href.startsWith("#") ? (
                        <a
                          href={link.href}
                          className="text-bone/70 hover:text-bone text-[0.9375rem] underline-offset-4 transition-colors duration-200 hover:underline"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-bone/70 hover:text-bone text-[0.9375rem] underline-offset-4 transition-colors duration-200 hover:underline"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                  {column.title === "Legal" ? (
                    <li>
                      <CookiePreferencesButton className="text-bone/70 hover:text-bone text-left text-[0.9375rem] underline-offset-4 transition-colors duration-200 hover:underline" />
                    </li>
                  ) : null}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-bone/12 mt-16 flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-bone/55 text-[0.8125rem]">
            © {year} {brand.name}. All rights reserved.
          </p>
          <p className="label-xs text-bone/55">Made in {brand.city}</p>
        </div>
      </div>
    </footer>
  );
}

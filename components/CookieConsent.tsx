"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import {
  ALLOW_ALL,
  CATEGORIES,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  DENY_ALL,
  decodeConsent,
  encodeConsent,
  type ConsentState,
} from "@/lib/consent";

/** Fired after a choice is saved, so scripts can start or stop. */
export const CONSENT_EVENT = "1127:consent";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeConsent(state: ConsentState) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeConsent(state)}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
}

/** Read the current choice from anywhere on the client. */
export function currentConsent(): ConsentState | null {
  return decodeConsent(readCookie(CONSENT_COOKIE));
}

/**
 * Bottom banner shown until a choice is recorded.
 *
 * Deliberately not a modal: nothing on this site is gated behind consent, so
 * trapping focus to force an answer would be hostile and legally pointless.
 * It renders only after mount so the page can still be statically generated.
 */
export function CookieConsent() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(DENY_ALL);

  const openBanner = useCallback(() => {
    setDraft(currentConsent() ?? DENY_ALL);
    setDetail(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    // Deferred a frame so the state update happens outside the effect body,
    // which also means the banner never flashes in mid-hydration.
    const frame = requestAnimationFrame(() => {
      if (!currentConsent()) setOpen(true);
    });

    // The footer link reopens this so a choice can always be changed.
    const reopen = () => openBanner();
    window.addEventListener("1127:open-consent", reopen);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("1127:open-consent", reopen);
    };
  }, [openBanner]);

  const save = (state: ConsentState) => {
    writeConsent(state);
    setOpen(false);
    setDetail(false);
  };

  // Never over a ticket at the door: the wallet page is held up to a
  // scanner, and this page sets no optional cookies to consent to anyway.
  if (pathname.startsWith("/t/")) return null;
  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="animate-rise fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-5 sm:pb-5"
    >
      <div className="border-ink/12 bg-bone mx-auto max-w-4xl rounded-2xl border p-5 shadow-[0_24px_70px_-30px_rgba(7,20,47,0.55)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg leading-snug">
              We keep cookies to a minimum.
            </h2>
            <p className="text-ink/70 mt-2 text-[0.875rem] leading-relaxed">
              Right now this site sets one cookie to remember this choice, and one
              more only if you sign in to the dashboard. No advertising or analytics
              cookies are in use. If that changes, this is where you&apos;ll control
              it.{" "}
              <Link
                href="/cookies"
                className="text-cobalt underline-offset-4 hover:underline"
              >
                Read the cookie policy
              </Link>
              .
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => save(DENY_ALL)}
              className={buttonClass("outline", "sm")}
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={() => setDetail((value) => !value)}
              aria-expanded={detail}
              aria-controls="cookie-preferences"
              className={buttonClass("ghost", "sm", "text-ink/70 hover:text-ink")}
            >
              {detail ? "Hide options" : "Choose"}
            </button>
            <button
              type="button"
              onClick={() => save(ALLOW_ALL)}
              className={buttonClass("primary", "sm")}
            >
              Accept all
            </button>
          </div>
        </div>

        {detail ? (
          <div id="cookie-preferences" className="border-ink/12 mt-5 border-t pt-5">
            <ul className="space-y-3">
              {CATEGORIES.map((category) => {
                const locked = Boolean(category.locked);
                const checked =
                  locked || draft[category.id as "analytics" | "marketing"];

                return (
                  <li key={category.id}>
                    <label
                      className={`border-ink/15 bg-bone-soft flex items-start gap-3 rounded-xl border px-4 py-3 ${
                        locked ? "opacity-70" : "hover:border-ink/30 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            [category.id]: event.target.checked,
                          }))
                        }
                        className="accent-cobalt mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span>
                        <span className="block text-[0.9375rem] font-medium">
                          {category.label}
                          {locked ? (
                            <span className="text-ink/65 ml-2 text-[0.8125rem] font-normal">
                              Always on
                            </span>
                          ) : null}
                        </span>
                        <span className="text-ink/65 mt-1 block text-[0.8125rem] leading-relaxed">
                          {category.body}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => save(draft)}
                className={buttonClass("primary", "sm")}
              >
                Save choices
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Footer link that reopens the banner. */
export function CookiePreferencesButton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("1127:open-consent"))}
      className={className}
    >
      Cookie preferences
    </button>
  );
}

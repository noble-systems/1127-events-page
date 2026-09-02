"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/list", label: "People" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/audience", label: "Audience" },
  { href: "/admin/tickets", label: "Tickets" },
  { href: "/admin/door", label: "Door" },
  { href: "/admin/ambassadors", label: "Ambassadors" },
  { href: "/admin/links", label: "Links" },
  { href: "/admin/traffic", label: "Traffic" },
  { href: "/admin/preview", label: "Page content" },
];

export function AdminNav({ email, mode }: { email: string; mode: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating closes the menu; a menu that lingers over the new page reads
  // as a bug.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const current = LINKS.find((link) => isActive(link.href, link.exact));

  return (
    <header className="border-ink/12 bg-bone/90 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-x-4 px-5 py-3.5 md:gap-x-6 md:px-8">
        <Link href="/admin" className="shrink-0 hover:opacity-70">
          <Wordmark />
        </Link>

        <span
          aria-hidden="true"
          className="bg-ink/15 hidden h-5 w-px shrink-0 lg:block"
        />

        {/* Desktop: the full row. Phone and tablet get a real menu below. */}
        <nav aria-label="Admin" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active = isActive(link.href, link.exact);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-full px-3.5 py-2 text-[0.875rem] transition-colors duration-200 ${
                      active
                        ? "bg-ink text-bone"
                        : "text-ink/70 hover:bg-ink/[0.07] hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Current page + menu button, phone and tablet only. */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          className="border-ink/20 hover:border-ink/45 flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.875rem] font-medium lg:hidden"
        >
          {current?.label ?? "Menu"}
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={`h-3 w-3 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
          >
            <path
              d="m2 4 4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="ml-auto flex items-center gap-3">
          {mode === "dev" ? (
            <span className="border-terracotta/50 text-terracotta-deep hidden rounded-full border border-dashed px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase sm:inline">
              Local dev auth
            </span>
          ) : null}
          <span className="text-ink/65 hidden text-[0.8125rem] xl:inline">
            {email}
          </span>
          <Link
            href="/"
            className="text-ink/65 hover:text-ink hidden text-[0.8125rem] underline-offset-4 hover:underline sm:inline"
          >
            View site
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="border-ink/20 hover:border-ink/45 rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {/* The dropdown menu itself: a clean two-column list, no sideways
          anything. */}
      {menuOpen ? (
        <nav
          id="admin-menu"
          aria-label="Admin"
          className="border-ink/12 bg-bone border-t shadow-[0_24px_40px_-24px_rgba(25,23,19,0.35)] lg:hidden"
        >
          <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-1 px-5 py-4">
            {LINKS.map((link) => {
              const active = isActive(link.href, link.exact);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-xl px-4 py-3 text-[0.9375rem] ${
                      active
                        ? "bg-ink text-bone"
                        : "text-ink/75 hover:bg-ink/[0.07] hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li className="col-span-2 mt-1 sm:hidden">
              <Link
                href="/"
                className="text-ink/65 hover:text-ink block rounded-xl px-4 py-3 text-[0.9375rem]"
              >
                View site
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

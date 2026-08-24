"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
  { href: "/admin/traffic", label: "Traffic" },
  { href: "/admin/preview", label: "Page content" },
];

export function AdminNav({ email, mode }: { email: string; mode: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <header className="border-ink/12 bg-bone/90 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 md:px-8">
        <Link href="/admin" className="shrink-0 hover:opacity-70">
          <Wordmark />
        </Link>

        <span
          aria-hidden="true"
          className="bg-ink/15 hidden h-5 w-px shrink-0 sm:block"
        />

        <nav aria-label="Admin" className="order-3 w-full sm:order-none sm:w-auto">
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

        <div className="ml-auto flex items-center gap-3">
          {mode === "dev" ? (
            <span className="border-terracotta/50 text-terracotta-deep rounded-full border border-dashed px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase">
              Local dev auth
            </span>
          ) : null}
          <span className="text-ink/65 hidden text-[0.8125rem] md:inline">
            {email}
          </span>
          <Link
            href="/"
            className="text-ink/65 hover:text-ink text-[0.8125rem] underline-offset-4 hover:underline"
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
    </header>
  );
}

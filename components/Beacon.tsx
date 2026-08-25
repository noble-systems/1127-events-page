"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Sends one anonymous page-view tick per page seen.
 *
 * Runs on mount and on every client-side navigation. Deliberately dumb: the
 * server does all validation, so this stays a handful of bytes with nothing to
 * misconfigure.
 *
 * People who ask not to be tracked are not tracked: Do Not Track and Global
 * Privacy Control both stop the beacon before it sends. Being cookieless and
 * aggregate-only arguably satisfies both anyway; honouring them outright is
 * simpler than arguing.
 */
export function Beacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/door")) return;

    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;

    const payload = JSON.stringify({
      path: pathname,
      ref: document.referrer || undefined,
      query: window.location.search || undefined,
    });

    // sendBeacon survives page unload and never blocks paint; the fetch
    // fallback covers browsers that lack it.
    if (!navigator.sendBeacon?.("/api/beacon", payload)) {
      fetch("/api/beacon", {
        method: "POST",
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [pathname]);

  return null;
}

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
function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || Boolean(nav.globalPrivacyControl);
}

function post(payload: object): void {
  const body = JSON.stringify(payload);
  // sendBeacon survives page unload and never blocks paint; the fetch
  // fallback covers browsers that lack it.
  if (!navigator.sendBeacon?.("/api/beacon", body)) {
    fetch("/api/beacon", { method: "POST", body, keepalive: true }).catch(
      () => undefined,
    );
  }
}

export function Beacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/door")) return;
    if (optedOut()) return;

    post({
      path: pathname,
      ref: document.referrer || undefined,
      query: window.location.search || undefined,
    });
  }, [pathname]);

  /**
   * Time on page, counted while the tab is actually visible. One dwell
   * report per page seen, sent when the page is left (tab hidden, closed,
   * or navigated away from), so the counter can never double-count a page.
   */
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/door")) return;
    if (optedOut()) return;

    let shownAt = document.visibilityState === "visible" ? Date.now() : 0;
    let total = 0;
    let sent = false;

    const send = () => {
      if (sent) return;
      if (shownAt) {
        total += Date.now() - shownAt;
        shownAt = 0;
      }
      const seconds = Math.round(total / 1000);
      if (seconds < 1) return;
      sent = true;
      post({ path: pathname, dwell: seconds });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Mobile browsers often never fire pagehide; hidden is the last
        // reliable moment. Sending here means time after a return to the
        // tab goes uncounted, which undercounts rather than double-counts.
        send();
      } else if (!sent && !shownAt) {
        shownAt = Date.now();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [pathname]);

  return null;
}

/**
 * A named funnel tick (tier_pick, buy_click): counted server-side against
 * the day, nothing about who. Safe to call from any client component.
 */
export function trackEvent(name: string): void {
  try {
    if (optedOut()) return;
    post({ event: name });
  } catch {
    /* never let analytics break a page */
  }
}

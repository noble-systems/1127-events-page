"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CONSENT_EVENT, currentConsent } from "@/components/CookieConsent";
import { metaPixelId } from "@/content/site";

/**
 * The Meta Pixel, loaded ONLY after the visitor turns the marketing toggle
 * on in the cookie banner. Until then nothing from Facebook touches the
 * page: no script, no noscript beacon, no cookie. Revoking the choice later
 * tells the pixel to stop via its consent API.
 *
 * Kept off the admin and door surfaces, same as our own analytics.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function loadPixel(): void {
  if (window.fbq) return;
  const fbq: Fbq = (...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue?.push(args);
    }
  };
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", metaPixelId);
}

/** Fire a pixel event if the pixel is loaded; a silent no-op otherwise. */
export function pixelTrack(
  name: string,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  try {
    window.fbq?.(
      "track",
      name,
      params ?? {},
      eventId ? { eventID: eventId } : undefined,
    );
  } catch {
    /* advertising must never break a page */
  }
}

export function MetaPixel() {
  const pathname = usePathname();
  const granted = useRef(false);

  // Consent decides whether the pixel exists at all.
  useEffect(() => {
    const apply = () => {
      const consent = currentConsent();
      if (consent?.marketing) {
        if (!granted.current) {
          loadPixel();
          window.fbq?.("consent", "grant");
          const path = window.location.pathname;
          if (!path.startsWith("/admin") && !path.startsWith("/door")) {
            window.fbq?.("track", "PageView");
          }
          granted.current = true;
        }
      } else if (granted.current) {
        window.fbq?.("consent", "revoke");
        granted.current = false;
      }
    };
    apply();
    window.addEventListener(CONSENT_EVENT, apply);
    return () => window.removeEventListener(CONSENT_EVENT, apply);
  }, []);

  // SPA navigations count as page views too.
  useEffect(() => {
    if (!granted.current || !pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/door")) return;
    window.fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}

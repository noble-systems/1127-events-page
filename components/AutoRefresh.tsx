"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the server render every few seconds. Sits on the thanks page's
 * "Payment processing" state, which exists only for the seconds between
 * Square's redirect and our webhook; the moment the order settles, the paid
 * render replaces this component and the polling stops with it.
 */
export function AutoRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);

  return null;
}

"use client";

import { useEffect } from "react";
import { pixelTrack } from "@/components/MetaPixel";

/**
 * Fires the Meta Purchase event once on a paid thanks page. The order ref
 * rides as the eventID, so a reloaded page (or a later server-side event)
 * deduplicates instead of double-counting revenue in Ads Manager.
 */
export function PurchasePixel({
  orderRef,
  valueCents,
}: {
  orderRef: string;
  valueCents: number;
}) {
  useEffect(() => {
    pixelTrack(
      "Purchase",
      { value: (valueCents / 100).toFixed(2), currency: "USD" },
      orderRef,
    );
  }, [orderRef, valueCents]);

  return null;
}

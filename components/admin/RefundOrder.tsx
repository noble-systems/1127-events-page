"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The full-refund switch on one paid order. Confirms with the amount,
 * because this one moves real money; everything after the confirm is
 * idempotent on the server, so a nervous double-click cannot pay twice.
 */
export function RefundOrder({
  orderRef,
  amountLabel,
}: {
  orderRef: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refund = async () => {
    if (
      !window.confirm(
        `Refund ${amountLabel} in full? The money goes back to their card (5-10 business days), their tickets stop scanning, and the seats go back on sale. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refund: orderRef }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;
    if (!response?.ok || !data?.ok) {
      setMessage(data?.message ?? "That didn't work.");
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <span className="block whitespace-nowrap">
      <button
        type="button"
        disabled={busy}
        onClick={() => void refund()}
        className="text-terracotta-deep text-[0.75rem] underline underline-offset-2"
      >
        {busy ? "Refunding..." : "Refund"}
      </button>
      {message ? (
        <span className="text-terracotta-deep ml-1 block text-[0.7rem]">
          {message}
        </span>
      ) : null}
    </span>
  );
}

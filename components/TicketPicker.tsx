"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { recallVia, rememberVia } from "@/components/viaSession";

/**
 * The tier chooser: radios for the type, a count, one button. Payment itself
 * happens on Square's page; this component's whole job is to ask for the
 * right thing and hand the browser over.
 */

export type PickerTier = {
  id: string;
  name: string;
  priceLabel: string;
  /** How many this order could buy: 0 means sold out. */
  max: number;
  /** Shown as "Only N left" when the pool is nearly dry. */
  scarce: number | null;
};

export function TicketPicker({
  eventId,
  tiers,
  via: viaFromLink,
}: {
  eventId: string;
  tiers: PickerTier[];
  /** Ambassador code carried by the share link that landed here, if any. */
  via?: string;
}) {
  const router = useRouter();
  const firstOpen = tiers.find((tier) => tier.max > 0);
  const [tierId, setTierId] = useState(firstOpen?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [via, setVia] = useState(viaFromLink ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * A link-borne code outlives the URL via sessionStorage, so wandering off
   * to the lineup and back does not cost the ambassador their credit. The
   * field stays editable: a typed code (from a flyer, a story screenshot)
   * beats an absent one.
   */
  useEffect(() => {
    if (viaFromLink) rememberVia(viaFromLink);
    else {
      const stored = recallVia();
      // Reading storage in an effect (not in the initializer) keeps the
      // server and client first renders identical; the one extra render on
      // recall is the price of a clean hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setVia((current) => current || stored);
    }
  }, [viaFromLink]);

  const chosen = tiers.find((tier) => tier.id === tierId) ?? null;
  const max = chosen?.max ?? 0;
  const emailOk = /^[^@]+@[^@]+[.][^@]+$/.test(email.trim());

  const buy = async () => {
    if (!chosen || busy || !emailOk) return;
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          tierId: chosen.id,
          quantity,
          email: email.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          optIn: true,
          ...(via.trim() ? { via: via.trim() } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        message?: string;
        soldOut?: boolean;
      } | null;

      if (data?.ok && data.url) {
        // Off to Square. busy stays true so the button cannot double-fire
        // while the navigation happens.
        window.location.assign(data.url);
        return;
      }

      setMessage(data?.message ?? "Something went wrong. Try again.");
      // Sold out mid-choice: re-render the server's fresh counts.
      if (data?.soldOut) router.refresh();
      setBusy(false);
    } catch {
      setMessage("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  };

  return (
    <div>
      <fieldset className="space-y-2.5">
        <legend className="sr-only">Ticket type</legend>
        {tiers.map((tier) => {
          const soldOut = tier.max === 0;
          const selected = tier.id === tierId;
          return (
            <label
              key={tier.id}
              className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3.5 transition-colors duration-200 ${
                soldOut
                  ? "border-ink/10 cursor-not-allowed opacity-50"
                  : selected
                    ? "border-ink bg-bone-soft"
                    : "border-ink/15 hover:border-ink/35"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="tier"
                  value={tier.id}
                  checked={selected}
                  disabled={soldOut || busy}
                  onChange={() => {
                    setTierId(tier.id);
                    setQuantity((q) => Math.min(q, tier.max));
                  }}
                  className="accent-ink h-4 w-4"
                />
                <span>
                  <span className="block text-[0.9375rem] font-medium">
                    {tier.name}
                  </span>
                  {soldOut ? (
                    <span className="text-ink/55 block text-[0.8125rem]">
                      Sold out
                    </span>
                  ) : tier.scarce !== null ? (
                    <span className="text-sun-deep block text-[0.8125rem]">
                      Only {tier.scarce} left
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="font-display text-xl">{tier.priceLabel}</span>
            </label>
          );
        })}
      </fieldset>

      {chosen && max > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-ink/70 block text-[0.875rem]">
            Email for your tickets
            <input
              type="email"
              value={email}
              disabled={busy}
              required
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              className="border-ink/20 bg-bone mt-1.5 block w-full rounded-lg border px-3 py-2 text-[0.9375rem]"
            />
          </label>
          <label className="text-ink/70 block text-[0.875rem]">
            Phone (optional, day-of updates)
            <input
              type="tel"
              value={phone}
              disabled={busy}
              placeholder="(480) 555-0123"
              autoComplete="tel"
              onChange={(e) => setPhone(e.target.value)}
              className="border-ink/20 bg-bone mt-1.5 block w-full rounded-lg border px-3 py-2 text-[0.9375rem]"
            />
          </label>
        </div>
      ) : null}

      {chosen && max > 0 ? (
        <div className="mt-5 flex items-center gap-4">
          <label className="text-ink/70 flex items-center gap-2.5 text-[0.9375rem]">
            How many
            <select
              value={quantity}
              disabled={busy}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="border-ink/20 bg-bone rounded-lg border px-3 py-2 text-[0.9375rem]"
            >
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <Button
            onClick={buy}
            disabled={busy || !emailOk}
            variant="primary"
            size="lg"
          >
            {busy ? "Opening checkout…" : "Continue to payment"}
          </Button>
        </div>
      ) : null}

      {chosen && max > 0 ? (
        <label className="text-ink/70 mt-4 flex items-center gap-2.5 text-[0.875rem]">
          Ambassador code
          <input
            type="text"
            value={via}
            disabled={busy}
            placeholder="optional"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setVia(e.target.value.toUpperCase())}
            className="border-ink/20 bg-bone w-36 rounded-lg border px-3 py-2 text-[0.875rem] tracking-wide uppercase"
          />
        </label>
      ) : null}

      {message ? (
        <p className="text-terracotta-deep mt-4 text-[0.875rem]" role="alert">
          {message}
        </p>
      ) : null}

      <p className="text-ink/55 mt-5 text-[0.8125rem] leading-relaxed">
        Payment is handled by Square on a secure page. Your tickets arrive by
        email the moment it goes through. Buying adds you to the 1127 events
        list; every email has a one-click unsubscribe. The phone number is
        only for updates about this event.
      </p>
    </div>
  );
}

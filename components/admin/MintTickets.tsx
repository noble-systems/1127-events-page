"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * The house's own ticket window: pick an event, a type, a count and an
 * email, and the tickets arrive there free, QRs and wallet link included.
 * Comps draw from the same pool as sales, so a full tier says so instead of
 * overfilling the room.
 */
export function MintTickets({
  events,
}: {
  events: Array<{
    id: string;
    name: string;
    tiers: Array<{ id: string; name: string }>;
  }>;
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [tierId, setTierId] = useState(events[0]?.tiers[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = events.find((event) => event.id === eventId);

  const mint = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/comp-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, tierId, quantity, email }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "That didn't work.");
      } else {
        setNote(`Sent ${quantity} free ${quantity === 1 ? "ticket" : "tickets"} to ${email.trim()}.`);
        setEmail("");
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (events.length === 0) return null;

  return (
    <section className="border-ink/12 bg-bone rounded-2xl border p-6">
      <h2 className="font-display text-xl">Mint tickets</h2>
      <p className="text-ink/65 mt-2 max-w-2xl text-[0.8125rem] leading-relaxed">
        Free tickets, sent by email with their QRs, drawn from the same pool
        as sales. For guests of the house, artists, and making things right.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-ink/70 block text-[0.875rem]">
          Event
          <select
            value={eventId}
            disabled={busy}
            onChange={(e) => {
              setEventId(e.target.value);
              const next = events.find((event) => event.id === e.target.value);
              setTierId(next?.tiers[0]?.id ?? "");
            }}
            className="border-ink/20 bg-bone-soft mt-1.5 block rounded-lg border px-3 py-2 text-[0.9375rem]"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-ink/70 block text-[0.875rem]">
          Type
          <select
            value={tierId}
            disabled={busy}
            onChange={(e) => setTierId(e.target.value)}
            className="border-ink/20 bg-bone-soft mt-1.5 block rounded-lg border px-3 py-2 text-[0.9375rem]"
          >
            {(chosen?.tiers ?? []).map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-ink/70 block text-[0.875rem]">
          How many
          <select
            value={quantity}
            disabled={busy}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="border-ink/20 bg-bone-soft mt-1.5 block rounded-lg border px-3 py-2 text-[0.9375rem]"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="text-ink/70 block text-[0.875rem]">
          Email
          <input
            type="email"
            value={email}
            disabled={busy}
            placeholder="guest@example.com"
            onChange={(e) => setEmail(e.target.value)}
            className="border-ink/20 bg-bone-soft mt-1.5 block w-64 rounded-lg border px-3 py-2 text-[0.9375rem]"
          />
        </label>

        <Button
          onClick={mint}
          variant="primary"
          size="md"
          disabled={busy || !email.trim() || !tierId}
        >
          {busy ? "Sending…" : "Send free tickets"}
        </Button>
      </div>

      {note ? (
        <p role="status" className="text-cobalt mt-3 text-[0.875rem]">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-terracotta-deep mt-3 text-[0.875rem]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

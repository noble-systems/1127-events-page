import { randomBytes } from "node:crypto";
import type { EventRecord, TicketTier } from "./types.ts";

/**
 * Ticketing's pure layer: money, codes, and the little rules every route
 * needs. Storage is in tickets-store.ts, Square in square.ts; this module has
 * no dependencies so the rules are testable without either.
 */

/**
 * One order buys one tier. Multi-tier carts add real complexity (partial
 * sold-outs mid-checkout, split refunds) for a flow nightlife buyers rarely
 * use; two orders take ninety seconds. Eight covers a table's worth.
 */
export const MAX_TICKETS_PER_ORDER = 8;

/** "$15" when even, "$15.50" when not. Money never renders as 15.000000001. */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}

/**
 * A ticket code a door person can read out loud: no 0/O, 1/I/L, grouped in
 * threes. 9 characters over a 31-letter alphabet is ~10^13 codes, and the
 * store still refuses collisions on write.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newTicketCode(): string {
  const bytes = randomBytes(9);
  let code = "";
  for (let i = 0; i < 9; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 2 || i === 5) code += "-";
  }
  return code;
}

/** The tiers an event actually sells: selling switched on and tiers defined. */
export function sellableTiers(event: EventRecord): TicketTier[] {
  if (event.ticketsEnabled !== true || !event.published) return [];
  return (event.ticketTiers ?? []).filter(
    (tier) => tier.capacity > 0 && tier.priceCents > 0,
  );
}

/** Whether the event's tickets page sells anything at all. */
export function isSelling(event: EventRecord): boolean {
  return sellableTiers(event).length > 0;
}

/**
 * A quantity from the outside world, clamped to something orderable.
 * Returns null rather than guessing when the input is not a whole number.
 */
export function readQuantity(raw: unknown): number | null {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > MAX_TICKETS_PER_ORDER) return null;
  return n;
}

/**
 * One order as stored: the paper trail for one checkout.
 *
 * "attention" is the one state that should never happen and must be loud
 * when it does: money arrived for a hold the sweep had already released,
 * and the seats were gone by then. The admin page surfaces it; the fix is
 * a refund in the Square dashboard.
 */
export type TicketOrder = {
  /** OUR order id, minted before the processor is ever called. */
  ref: string;
  status: "pending" | "paid" | "expired" | "attention";
  eventId: string;
  tierId: string;
  /** Snapshots, so the record still reads right after a rename or price change. */
  eventName: string;
  tierName: string;
  quantity: number;
  amountCents: number;
  /** Square's ids: the order the webhook names, and the link the sweep kills. */
  squareOrderId?: string;
  linkId?: string;
  email?: string | null;
  /** Issued codes, present once paid. */
  codes?: string[];
  createdAt: string;
  updatedAt: string;
};

export type TicketRecord = {
  code: string;
  orderId: string;
  eventId: string;
  tierId: string;
  email: string | null;
  status: "valid" | "revoked";
  createdAt: string;
};

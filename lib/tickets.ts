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

/** The tiers an event actually sells: selling on, tier real, tier not hidden. */
export function sellableTiers(event: EventRecord): TicketTier[] {
  if (event.ticketsEnabled !== true || !event.published) return [];
  return (event.ticketTiers ?? []).filter(
    (tier) =>
      tier.hidden !== true &&
      // An off-platform tier is sellable as long as its link exists; the
      // capacity and price rules only guard OUR checkout.
      (tier.externalUrl
        ? true
        : tier.capacity > 0 && tier.priceCents > 0),
  );
}

/** Whether the event's tickets page sells anything at all. */
export function isSelling(event: EventRecord): boolean {
  return sellableTiers(event).length > 0;
}

/**
 * Seats actually offerable right now: zero when manually flagged sold out,
 * otherwise capacity minus everything held or sold. Every surface that says
 * "sold out" or counts availability goes through this one door.
 */
export function remainingFor(tier: TicketTier, taken: number): number {
  if (tier.soldOut === true) return 0;
  return Math.max(0, tier.capacity - taken);
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
  /** The ambassador code this sale is credited to, validated at checkout. */
  via?: string;
  /** The tracking-link id (which post drove this sale), validated at checkout. */
  src?: string;
  /**
   * Collected on OUR page before Square ever loads: the ticket email must
   * not depend on what a payment processor happens to hand back. Phone is
   * optional, for day-of updates. optIn is the marketing checkbox, default
   * off; buying a ticket is not a mailing-list signup.
   */
  email?: string | null;
  phone?: string | null;
  optIn?: boolean;
  /** Terms version accepted at checkout; the consent paper trail. */
  termsVersion?: string;
  /** Ticked the "I'm 21 or older" box on a 21+ event. */
  ageConfirmed?: boolean;
  /** Issued free by an admin or the reward system; never counts as a sale. */
  comp?: boolean;
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
  /** "used" is stamped by the door scanner, exactly once. */
  status: "valid" | "used" | "revoked";
  usedAt?: string;
  createdAt: string;
};

/**
 * Pulls a ticket code out of whatever a QR scan produced.
 *
 * The QR encodes the door URL so a native camera app also lands somewhere
 * useful, which means the scanner sees URLs, and a hand-typed entry sees the
 * bare code. Both normalise here; junk returns null.
 */
export function extractTicketCode(raw: string): string | null {
  const text = raw.trim();
  const fromUrl = text.match(/[?&]code=([A-Za-z0-9-]+)/)?.[1] ?? text;
  const code = fromUrl.trim().toUpperCase();
  return /^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(code) ? code : null;
}

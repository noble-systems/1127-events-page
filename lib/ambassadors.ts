import type { SubmissionRecord } from "./types.ts";
import type { TicketOrder } from "./tickets.ts";

/**
 * Ambassador codes: the attribution layer that decides who gets paid.
 *
 * An ambassador gets one code. It reaches the site two ways: typed into the
 * ticket checkout, or carried by their share link (/a/<code>) into RSVPs and
 * purchases. Every attributed row stores the code, and the admin page counts
 * rows, so "how many did DANI bring" is arithmetic over the paper trail
 * rather than a counter that could drift from it.
 *
 * Deliberately NOT a discount system. A code changes who gets credit, never
 * what the buyer pays; pricing stays exactly what the tier says. If discounts
 * are ever wanted they are a separate feature with its own rules.
 *
 * Pure module: rules and arithmetic only, so both are testable without AWS.
 */

/** Codes read aloud and typed on phones: short, uppercase, unambiguous. */
export function normalizeAmbassadorCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidAmbassadorCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(code);
}

/** A starting suggestion from a name; the admin can overrule it. */
export function suggestAmbassadorCode(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return cleaned.length >= 3 ? cleaned : "";
}

export type Ambassador = {
  code: string;
  name: string;
  /** Inactive codes stop attributing but keep their history. */
  active: boolean;
  createdAt: string;
};

export type AmbassadorStats = Ambassador & {
  rsvps: number;
  orders: number;
  tickets: number;
  grossCents: number;
};

/**
 * The payout sheet: every code with what it brought in. Counts paid orders
 * only; a pending or expired checkout brought nobody through the door.
 */
export function ambassadorStats(
  ambassadors: readonly Ambassador[],
  orders: readonly TicketOrder[],
  rsvps: readonly SubmissionRecord[],
): AmbassadorStats[] {
  return ambassadors.map((ambassador) => {
    const paid = orders.filter(
      (order) => order.status === "paid" && order.via === ambassador.code,
    );
    return {
      ...ambassador,
      rsvps: rsvps.filter((row) => row.via === ambassador.code).length,
      orders: paid.length,
      tickets: paid.reduce((sum, order) => sum + order.quantity, 0),
      grossCents: paid.reduce((sum, order) => sum + order.amountCents, 0),
    };
  });
}

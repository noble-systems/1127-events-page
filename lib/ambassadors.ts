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
  /** Where their free tickets go. Absent on codes made before rewards. */
  email?: string;
  /** Inactive codes stop attributing but keep their history. */
  active: boolean;
  /** How many free tickets have already been issued to them. */
  rewardsGiven?: number;
  /**
   * Events they already got their free ticket for. The reward is one ticket
   * per event, full stop: selling the threshold again for the same event
   * earns nothing more.
   */
  rewardedEvents?: string[];
  /** When the welcome email with their link went out. Absent = not yet. */
  welcomeEmailAt?: string;
  /** When their welcome comp ticket went out. Absent = not yet. */
  welcomeTicketAt?: string;
  createdAt: string;
};

export type AmbassadorStats = Ambassador & {
  rsvps: number;
  orders: number;
  tickets: number;
  grossCents: number;
  /** Times somebody opened their share link. */
  clicks: number;
};

/**
 * Default: the free ticket unlocks at this many sold for one event. One
 * ticket per event, not one per multiple; the dashboard can change the
 * threshold.
 */
export const REWARD_EVERY_DEFAULT = 3;

/**
 * The payout sheet: every code with what it brought in. Counts paid orders
 * only; a pending or expired checkout brought nobody through the door.
 */
export function ambassadorStats(
  ambassadors: readonly Ambassador[],
  orders: readonly TicketOrder[],
  rsvps: readonly SubmissionRecord[],
  clicksByCode: ReadonlyMap<string, number> = new Map(),
): AmbassadorStats[] {
  return ambassadors.map((ambassador) => {
    // Comp orders are excluded everywhere here: a free ticket the system
    // issued is not a sale, and must never count toward earning another.
    const paid = orders.filter(
      (order) =>
        order.status === "paid" &&
        order.via === ambassador.code &&
        order.comp !== true,
    );
    return {
      ...ambassador,
      // Free given is however many events have paid out, whichever bookkeeping
      // recorded it (the per-event list, or the counter from before it).
      rewardsGiven: Math.max(
        ambassador.rewardsGiven ?? 0,
        (ambassador.rewardedEvents ?? []).length,
      ),
      rsvps: rsvps.filter((row) => row.via === ambassador.code).length,
      orders: paid.length,
      tickets: paid.reduce((sum, order) => sum + order.quantity, 0),
      grossCents: paid.reduce((sum, order) => sum + order.amountCents, 0),
      clicks: clicksByCode.get(ambassador.code) ?? 0,
    };
  });
}

/**
 * Tickets sold by one code, comp orders excluded. The reward trigger.
 * With eventIds given, counts only sales for those events (an event plus its
 * former ids), because the reward is earned per event.
 */
export function ticketsSoldBy(
  code: string,
  orders: readonly TicketOrder[],
  eventIds?: readonly string[],
): number {
  return orders
    .filter(
      (order) =>
        order.status === "paid" &&
        order.via === code &&
        order.comp !== true &&
        (!eventIds || eventIds.includes(order.eventId)),
    )
    .reduce((sum, order) => sum + order.quantity, 0);
}

import { deletePaymentLink } from "./square.ts";
import { listOrders, releaseTickets, settleOrder } from "./tickets-store.ts";

/**
 * Reclaims seats from abandoned checkouts.
 *
 * Stripe expired its sessions and told us by webhook; Square payment links
 * live until somebody pays them, so the reclaiming is ours to do. Rather
 * than a scheduled job, the sweep runs at the moment it matters: when a
 * reserve fails, checkout sweeps this tier and retries, so "sold out" is
 * only ever said after the stale holds have been counted out.
 *
 * Per stale order, strictly in this order:
 *   1. delete the payment link, so the money door closes first
 *   2. flip the order pending -> expired (the conditional write wins races)
 *   3. release the held seats
 *
 * If a payment lands anyway (the buyer beat the delete by seconds), the
 * webhook's recovery path re-reserves; with the pool full again it marks the
 * order "attention", which the admin page wears loudly.
 */
export const HOLD_MINUTES = 35;

export async function sweepStaleHolds(
  eventIds: readonly string[],
  tierId: string,
  now: number,
): Promise<number> {
  const cutoff = now - HOLD_MINUTES * 60_000;
  let freed = 0;

  for (const order of await listOrders(eventIds)) {
    if (order.status !== "pending" || order.tierId !== tierId) continue;
    const created = Date.parse(order.createdAt);
    if (!Number.isFinite(created) || created > cutoff) continue;

    if (order.linkId) {
      try {
        await deletePaymentLink(order.linkId);
      } catch (error) {
        // A link that cannot be deleted right now is left alone entirely:
        // releasing its seats while it can still take money would sell them
        // twice. The next sweep tries again.
        console.error("[1127] sweep could not delete link", order.ref, error);
        continue;
      }
    }

    if (await settleOrder(order.ref, "expired")) {
      // Inventory lives under the CURRENT event id even when the order
      // predates a rename, so the release targets the ids we were given.
      await releaseTickets(eventIds[0], order.tierId, order.quantity);
      freed += order.quantity;
    }
  }

  return freed;
}

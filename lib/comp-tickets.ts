import { randomUUID } from "node:crypto";
import { sendTicketEmail, siteUrl } from "./email.ts";
import { newTicketCode, formatMoney, type TicketOrder } from "./tickets.ts";
import {
  createOrder,
  createTicket,
  markSold,
  reserveTickets,
  settleOrder,
} from "./tickets-store.ts";
import type { EventRecord, TicketTier } from "./types.ts";

/**
 * Comp tickets: issued free, by an admin or by the ambassador reward, and
 * real in every way that matters. They take seats out of the same pool the
 * paying public buys from (a comp for a sold-out tier is refused, not
 * conjured), they carry door codes from the same minter, they arrive in the
 * same email, and they scan at the same door. The only difference is the
 * order: comp: true, $0, and it never counts as a sale anywhere sales are
 * counted.
 */
export async function issueCompTickets(input: {
  event: EventRecord;
  tier: TicketTier;
  quantity: number;
  email: string;
  /** Attribution to keep, e.g. the ambassador whose reward this is. */
  via?: string;
  /** Rendered into the email heading, e.g. "On the house." */
  note?: string;
}): Promise<{ ok: true; order: TicketOrder } | { ok: false; reason: string }> {
  const { event, tier, quantity, email } = input;

  const held = await reserveTickets(event.id, tier.id, quantity, tier.capacity);
  if (!held) {
    return { ok: false, reason: `${tier.name} has no seats left to give.` };
  }

  const now = new Date().toISOString();
  const ref = randomUUID();
  const codes = Array.from({ length: quantity }, () => newTicketCode());

  const order: TicketOrder = {
    ref,
    status: "pending",
    eventId: event.id,
    tierId: tier.id,
    eventName: event.name,
    tierName: tier.name,
    quantity,
    amountCents: 0,
    email,
    comp: true,
    ...(input.via ? { via: input.via } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await createOrder(order);
    // The same pending -> paid gate as a purchase, so the wallet page and
    // the admin board treat a comp exactly like anything else that settled.
    await settleOrder(ref, "paid", { email, codes });
    await markSold(event.id, tier.id, quantity);

    for (const code of codes) {
      let ok = await createTicket({
        code,
        orderId: ref,
        eventId: event.id,
        tierId: tier.id,
        email,
        status: "valid",
        createdAt: now,
      });
      while (!ok) {
        ok = await createTicket({
          code: newTicketCode(),
          orderId: ref,
          eventId: event.id,
          tierId: tier.id,
          email,
          status: "valid",
          createdAt: now,
        });
      }
    }
  } catch (error) {
    console.error("[1127] comp issue failed", ref, error);
    return { ok: false, reason: "The comp could not be written. Try again." };
  }

  await sendTicketEmail(email, {
    eventName: event.name,
    tierName: tier.name,
    quantity,
    totalLabel: input.note ?? `${formatMoney(0)}, on the house`,
    codes,
    date: event.date,
    time: event.time ?? undefined,
    location: event.venue ?? event.location,
    walletUrl: `${siteUrl()}/t/${ref}`,
  }).catch((error) => console.error("[1127] comp email failed", ref, error));

  return { ok: true, order: { ...order, status: "paid", codes } };
}

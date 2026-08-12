import { NextResponse } from "next/server";
import { sendTicketEmail } from "@/lib/email";
import { getEvent } from "@/lib/store";
import { verifyStripeEvent, type CheckoutSessionLike } from "@/lib/stripe";
import { formatMoney, newTicketCode } from "@/lib/tickets";
import {
  createTicket,
  getOrder,
  markSold,
  releaseTickets,
  settleOrder,
} from "@/lib/tickets-store";

/**
 * POST /api/stripe/webhook
 *
 * Stripe's side of the conversation. Two events matter:
 *
 *   checkout.session.completed  money moved; issue tickets and email them
 *   checkout.session.expired    the buyer walked; return the held seats
 *
 * Deliveries are verified against the signing secret on the RAW body (any
 * reformatting breaks the HMAC), and they arrive at-least-once, so both
 * branches hinge on one conditional write: settleOrder flips pending to its
 * final state exactly once, and every redelivery after that is a no-op. The
 * settle happens BEFORE the side effects, so a crash mid-issue can cost one
 * buyer an email (visible on the orders page, recoverable by hand) but can
 * never issue the same tickets twice or double-count a sale.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event;
  try {
    event = verifyStripeEvent(payload, signature);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.expired"
  ) {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const session = event.data.object as CheckoutSessionLike;
  const order = await getOrder(session.id);
  if (!order) {
    // A session this site never opened (another environment, or test noise).
    console.error("[1127] webhook for unknown order", session.id);
    return NextResponse.json({ ok: true });
  }

  if (event.type === "checkout.session.expired") {
    const claimed = await settleOrder(session.id, "expired");
    if (claimed) {
      await releaseTickets(order.eventId, order.tierId, order.quantity);
    }
    return NextResponse.json({ ok: true });
  }

  /* checkout.session.completed */
  const email = session.customer_details?.email ?? null;
  const codes = Array.from({ length: order.quantity }, () => newTicketCode());

  const claimed = await settleOrder(session.id, "paid", { email, codes });
  if (!claimed) return NextResponse.json({ ok: true, already: true });

  try {
    await markSold(order.eventId, order.tierId, order.quantity);

    const now = new Date().toISOString();
    for (const code of codes) {
      // A collision means the code already belongs to somebody; mint again.
      let ok = await createTicket({
        code,
        orderId: order.sessionId,
        eventId: order.eventId,
        tierId: order.tierId,
        email,
        status: "valid",
        createdAt: now,
      });
      while (!ok) {
        ok = await createTicket({
          code: newTicketCode(),
          orderId: order.sessionId,
          eventId: order.eventId,
          tierId: order.tierId,
          email,
          status: "valid",
          createdAt: now,
        });
      }
    }

    if (email) {
      const eventRecord = await getEvent(order.eventId).catch(() => null);
      await sendTicketEmail(email, {
        eventName: order.eventName,
        tierName: order.tierName,
        quantity: order.quantity,
        totalLabel: formatMoney(order.amountCents),
        codes,
        date: eventRecord?.date,
        location: eventRecord?.venue ?? eventRecord?.location,
      });
    }
  } catch (error) {
    // The order is settled and the codes are on it; the admin orders page
    // shows everything needed to make this right by hand. Failing the
    // delivery would only replay into the settled gate.
    console.error("[1127] ticket issue failed after settle", session.id, error);
  }

  return NextResponse.json({ ok: true });
}

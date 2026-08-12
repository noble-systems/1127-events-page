import { NextResponse } from "next/server";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { siteUrl } from "@/lib/email";
import { listPublicEvents } from "@/lib/store";
import { readQuantity, sellableTiers, type TicketOrder } from "@/lib/tickets";
import { createOrder, releaseTickets, reserveTickets } from "@/lib/tickets-store";
import { createTicketCheckout, stripeConfigured } from "@/lib/stripe";

/**
 * POST /api/checkout  { eventId, tierId, quantity }
 *
 * Starts a ticket purchase: holds the seats, creates a Stripe Checkout
 * session, answers with the URL to send the buyer to.
 *
 * The order of operations is the contract. The hold is taken FIRST, against
 * the atomic counter, and only then is the session created; if Stripe fails,
 * the hold is released on the way out. Done the other way around, two buyers
 * could both be standing at a payment page for the last ticket, and one of
 * them would have paid for nothing. If the buyer walks away, the session
 * expires after 30 minutes and the expiry webhook returns the seats.
 */
export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  const throttle = await consume("checkout", ip);
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Ticket sales aren't switched on yet. Check back soon." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    eventId?: unknown;
    tierId?: unknown;
    quantity?: unknown;
  } | null;

  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const tierId = typeof body?.tierId === "string" ? body.tierId : "";
  const quantity = readQuantity(body?.quantity);

  // Resolved against the published list, never trusted from the client: a
  // crafted id cannot buy a draft, and the price comes from the stored tier,
  // not from anything the browser sent.
  const events = await listPublicEvents();
  const event = events.find((row) => row.id === eventId) ?? null;
  const tier = event
    ? (sellableTiers(event).find((row) => row.id === tierId) ?? null)
    : null;

  if (!event || !tier || quantity === null) {
    return NextResponse.json(
      { ok: false, message: "That ticket isn't available." },
      { status: 400 },
    );
  }

  const held = await reserveTickets(event.id, tier.id, quantity, tier.capacity);
  if (!held) {
    return NextResponse.json(
      {
        ok: false,
        soldOut: true,
        message:
          quantity > 1
            ? `There aren't ${quantity} left at that price.`
            : "That ticket type just sold out.",
      },
      { status: 409 },
    );
  }

  try {
    const { sessionId, url } = await createTicketCheckout({
      event,
      tier,
      quantity,
      siteUrl: siteUrl(),
    });

    const now = new Date().toISOString();
    const order: TicketOrder = {
      sessionId,
      status: "pending",
      eventId: event.id,
      tierId: tier.id,
      eventName: event.name,
      tierName: tier.name,
      quantity,
      amountCents: tier.priceCents * quantity,
      createdAt: now,
      updatedAt: now,
    };
    await createOrder(order);

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    // The hold must not outlive a failed checkout start.
    await releaseTickets(event.id, tier.id, quantity);
    console.error("[1127] checkout failed", error);
    return NextResponse.json(
      { ok: false, message: "The payment page couldn't be opened. Try again." },
      { status: 502 },
    );
  }
}

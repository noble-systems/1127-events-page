import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { siteUrl } from "@/lib/email";
import { LEGAL_VERSION } from "@/content/site";
import { listPublicEvents } from "@/lib/store";
import { normalizeAmbassadorCode } from "@/lib/ambassadors";
import { activeAmbassadorCode } from "@/lib/ambassadors-store";
import { getTrackLink } from "@/lib/track-links";
import {
  discountedUnitCents,
  getReminderSettings,
  readPromoToken,
} from "@/lib/reminder";
import { readQuantity, sellableTiers, type TicketOrder } from "@/lib/tickets";
import { createOrder, releaseTickets, reserveTickets } from "@/lib/tickets-store";
import { sweepStaleHolds } from "@/lib/ticket-sweep";
import { createTicketCheckout, squareConfigured } from "@/lib/square";

/**
 * POST /api/checkout  { eventId, tierId, quantity }
 *
 * Starts a ticket purchase: holds the seats, creates a Square payment link,
 * answers with the URL to send the buyer to.
 *
 * The order of operations is the contract. The hold is taken FIRST, against
 * the atomic counter, and only then is the payment page created; if Square
 * fails, the hold is released on the way out. Done the other way around, two
 * buyers could both be standing at a payment page for the last ticket, and
 * one of them would have paid for nothing.
 *
 * Square links do not expire by themselves, so a failed reserve first sweeps
 * this tier's stale holds (abandoned checkouts older than 35 minutes, links
 * deleted before seats return) and tries once more. "Sold out" is only ever
 * said after that.
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

  if (!squareConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Ticket sales aren't switched on yet. Check back soon." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    eventId?: unknown;
    tierId?: unknown;
    quantity?: unknown;
    via?: unknown;
    src?: unknown;
    email?: unknown;
    phone?: unknown;
    optIn?: unknown;
    agreeTerms?: unknown;
    confirmAge21?: unknown;
    promo?: unknown;
  } | null;

  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const tierId = typeof body?.tierId === "string" ? body.tierId : "";
  const quantity = readQuantity(body?.quantity);

  /**
   * The ticket email is collected HERE, on our page, not scraped back from
   * the processor: where the tickets go must not depend on what a checkout
   * page happens to report. Phone is optional; the marketing checkbox is
   * explicit consent, default off.
   */
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 40) : "";
  const optIn = body?.optIn === true;
  if (body?.agreeTerms !== true) {
    return NextResponse.json(
      { ok: false, message: "Accept the terms and conditions to continue." },
      { status: 400 },
    );
  }
  const confirmAge21 = body?.confirmAge21 === true;

  /**
   * A signed reminder promo. The signature pins the percentage; the settings
   * row decides whether the program is on and which percentage is honoured
   * right now, so old links die when the toggle flips.
   */
  let promoPct = 0;
  const claimedPct = readPromoToken(
    typeof body?.promo === "string" ? body.promo : null,
  );
  if (claimedPct !== null) {
    const settings = await getReminderSettings();
    if (settings.enabled && settings.pct === claimedPct) promoPct = claimedPct;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return NextResponse.json(
      { ok: false, message: "Enter the email your tickets should go to." },
      { status: 400 },
    );
  }

  /**
   * The ambassador code, typed at checkout or carried by a share link. Only
   * a real, active code is stored; a typo or a retired code never blocks a
   * sale, it just earns nobody the credit.
   */
  const via =
    typeof body?.via === "string" && body.via.trim()
      ? await activeAmbassadorCode(normalizeAmbassadorCode(body.via))
      : null;

  /**
   * The tracking-link id, carried invisibly from /l/<id>. Verified against
   * the stored links the same way the ambassador code is: a fabricated id
   * is dropped, never stored.
   */
  const src =
    typeof body?.src === "string" && body.src.trim()
      ? (await getTrackLink(body.src.trim().toLowerCase()))?.id ?? null
      : null;

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

  // A 21+ event requires the age box ticked; the consent rides the order.
  if (event.age21 === true && !confirmAge21) {
    return NextResponse.json(
      { ok: false, message: "This is a 21+ event; confirm you're 21 or older." },
      { status: 400 },
    );
  }

  // Off-platform tiers are bought on the partner page; our checkout must
  // never take money for inventory somebody else is counting.
  if (tier.externalUrl) {
    return NextResponse.json(
      { ok: false, message: "That ticket type is sold on a partner site." },
      { status: 400 },
    );
  }

  // Manually flagged sold out beats whatever the counter says; the sweep
  // retry below must not resurrect a tier the admin closed on purpose.
  if (tier.soldOut === true) {
    return NextResponse.json(
      { ok: false, soldOut: true, message: "That ticket type just sold out." },
      { status: 409 },
    );
  }

  let held = await reserveTickets(event.id, tier.id, quantity, tier.capacity);
  if (!held) {
    const swept = await sweepStaleHolds(
      [event.id, ...(event.formerIds ?? [])],
      tier.id,
      Date.now(),
    );
    if (swept >= quantity) {
      held = await reserveTickets(event.id, tier.id, quantity, tier.capacity);
    }
  }
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

  const ref = randomUUID();

  try {
    const unitPrice = promoPct
      ? discountedUnitCents(tier.priceCents, promoPct)
      : tier.priceCents;
    const { url, squareOrderId, linkId } = await createTicketCheckout({
      event,
      tier,
      quantity,
      ref,
      siteUrl: siteUrl(),
      buyerEmail: email,
      ...(phone ? { buyerPhone: phone } : {}),
      ...(promoPct
        ? {
            unitPriceCents: unitPrice,
            discountNote: `(${promoPct}% off)`,
          }
        : {}),
    });

    const now = new Date().toISOString();
    const order: TicketOrder = {
      ref,
      status: "pending",
      eventId: event.id,
      tierId: tier.id,
      eventName: event.name,
      tierName: tier.name,
      quantity,
      amountCents:
        (promoPct ? discountedUnitCents(tier.priceCents, promoPct) : tier.priceCents) *
        quantity,
      ...(promoPct ? { promoPct } : {}),
      squareOrderId,
      linkId,
      ...(via ? { via } : {}),
      ...(src ? { src } : {}),
      email,
      ...(phone ? { phone } : {}),
      ...(optIn ? { optIn: true } : {}),
      termsVersion: LEGAL_VERSION,
      ...(event.age21 === true ? { ageConfirmed: true } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await createOrder(order);

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    // The hold must not outlive a failed checkout start.
    await releaseTickets(event.id, tier.id, quantity);
    console.error("[1127] checkout failed", error);
    /**
     * The Square error rides in the response, because this platform's SSR
     * console never reaches CloudWatch: without this line a misconfigured
     * token or location is undiagnosable from outside. The message carries
     * an error CODE and status, never credentials.
     */
    const detail =
      error instanceof Error && error.message.startsWith("Square")
        ? ` (${error.message.slice(0, 160)})`
        : "";
    return NextResponse.json(
      {
        ok: false,
        message: `The payment page couldn't be opened. Try again.${detail}`,
      },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { extractTicketCode } from "@/lib/tickets";
import {
  getOrder,
  getTicket,
  markSold,
  releaseTickets,
  reserveTickets,
  setTicketRevoked,
} from "@/lib/tickets-store";

/**
 * Ticket administration: voiding a comp and putting it back.
 *
 *   PATCH {code, revoke: true}    valid -> revoked; the door refuses it
 *   PATCH {code, revoke: false}   revoked -> valid again
 *
 * Deliberately COMP-ONLY. A paid ticket is money, and voiding money belongs
 * with the refund in the Square dashboard, not one click deep in a table.
 */
export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    code?: unknown;
    revoke?: unknown;
  } | null;
  const code = extractTicketCode(
    typeof body?.code === "string" ? body.code : "",
  );
  if (!code || typeof body?.revoke !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "Say which ticket, and what to do with it." },
      { status: 400 },
    );
  }

  const ticket = await getTicket(code);
  if (!ticket) {
    return NextResponse.json(
      { ok: false, message: "No ticket with that code exists." },
      { status: 404 },
    );
  }
  const order = await getOrder(ticket.orderId);
  if (order?.comp !== true) {
    return NextResponse.json(
      {
        ok: false,
        message: "Only comp tickets can be voided here. Paid tickets are refunds, in Square.",
      },
      { status: 400 },
    );
  }

  /**
   * Restoring needs its seat back BEFORE the ticket revives: a full pool
   * refuses the restore rather than quietly overselling the tier.
   */
  if (!body.revoke) {
    const { getEvent } = await import("@/lib/store");
    const event = await getEvent(ticket.eventId).catch(() => null);
    const tier = event?.ticketTiers?.find((row) => row.id === ticket.tierId);
    if (!tier) {
      return NextResponse.json(
        { ok: false, message: "The event or ticket type no longer exists." },
        { status: 409 },
      );
    }
    const held = await reserveTickets(
      ticket.eventId,
      ticket.tierId,
      1,
      tier.capacity,
    );
    if (!held) {
      return NextResponse.json(
        { ok: false, message: "No seats left to restore this ticket into." },
        { status: 409 },
      );
    }
  }

  const result = await setTicketRevoked(code, body.revoke);
  if (!result.ok) {
    // The restore's freshly-taken seat goes straight back.
    if (!body.revoke) {
      await releaseTickets(ticket.eventId, ticket.tierId, 1);
    }
    const state = result.ticket?.status ?? "missing";
    return NextResponse.json(
      {
        ok: false,
        message:
          state === "used"
            ? "That ticket was already scanned at the door; nothing to void."
            : `That ticket is already ${state}.`,
      },
      { status: 409 },
    );
  }

  /**
   * The seat follows the ticket: a void returns it to the pool and takes it
   * off the sold count, a restore puts both back, so the board's totals and
   * the public page's availability always mean living tickets.
   */
  if (body.revoke) {
    await markSold(ticket.eventId, ticket.tierId, -1);
    await releaseTickets(ticket.eventId, ticket.tierId, 1);
  } else {
    await markSold(ticket.eventId, ticket.tierId, 1);
  }

  return NextResponse.json({ ok: true, status: result.ticket?.status });
}

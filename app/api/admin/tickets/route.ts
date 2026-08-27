import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { extractTicketCode } from "@/lib/tickets";
import { getOrder, getTicket, setTicketRevoked } from "@/lib/tickets-store";

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

  const result = await setTicketRevoked(code, body.revoke);
  if (!result.ok) {
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

  return NextResponse.json({ ok: true, status: result.ticket?.status });
}

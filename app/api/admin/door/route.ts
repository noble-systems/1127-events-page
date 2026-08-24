import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { extractTicketCode } from "@/lib/tickets";
import { checkInTicket, getOrder } from "@/lib/tickets-store";

/**
 * POST /api/admin/door  { code }
 *
 * One scan, one verdict. The response says exactly what the door needs to
 * hear and nothing it doesn't:
 *
 *   checked-in    let them through
 *   already-used  somebody came in on this code, with the timestamp
 *   revoked       refunded or cancelled; not a ticket any more
 *   unknown       not a code this system ever issued
 *
 * The status flip is atomic in the store, so two staff phones scanning the
 * same screenshot at the same moment produce exactly one green.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { code?: unknown } | null;
  const code = extractTicketCode(
    typeof body?.code === "string" ? body.code : "",
  );
  if (!code) {
    return NextResponse.json({ ok: false, result: "unknown" }, { status: 400 });
  }

  const { ok, ticket } = await checkInTicket(code);

  if (!ticket) {
    return NextResponse.json({ ok: false, result: "unknown", code });
  }

  // The order snapshot carries the human-readable half: which tier, which
  // event, whose email. Best effort; the verdict stands without it.
  const order = await getOrder(ticket.orderId).catch(() => null);
  const detail = {
    code,
    tierName: order?.tierName ?? ticket.tierId,
    eventName: order?.eventName ?? ticket.eventId,
    email: ticket.email ?? order?.email ?? null,
    quantity: order?.quantity ?? null,
  };

  if (ok) {
    return NextResponse.json({ ok: true, result: "checked-in", ...detail });
  }
  if (ticket.status === "used") {
    return NextResponse.json({
      ok: false,
      result: "already-used",
      usedAt: ticket.usedAt ?? null,
      ...detail,
    });
  }
  return NextResponse.json({ ok: false, result: "revoked", ...detail });
}

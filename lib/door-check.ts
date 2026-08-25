import { extractTicketCode } from "./tickets.ts";
import { checkInTicket, getOrder } from "./tickets-store.ts";

/**
 * One scan, one verdict, shared by whoever is allowed to stand at the door
 * (an admin, or door staff with a pass). The caller has already decided the
 * standing; this decides the ticket.
 */
export async function runDoorCheck(rawCode: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const code = extractTicketCode(rawCode);
  if (!code) return { status: 400, body: { ok: false, result: "unknown" } };

  const { ok, ticket } = await checkInTicket(code);
  if (!ticket) return { status: 200, body: { ok: false, result: "unknown", code } };

  const order = await getOrder(ticket.orderId).catch(() => null);
  const detail = {
    code,
    tierName: order?.tierName ?? ticket.tierId,
    eventName: order?.eventName ?? ticket.eventId,
    email: ticket.email ?? order?.email ?? null,
    quantity: order?.quantity ?? null,
  };

  if (ok) return { status: 200, body: { ok: true, result: "checked-in", ...detail } };
  if (ticket.status === "used") {
    return {
      status: 200,
      body: { ok: false, result: "already-used", usedAt: ticket.usedAt ?? null, ...detail },
    };
  }
  return { status: 200, body: { ok: false, result: "revoked", ...detail } };
}

import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { issueCompTickets } from "@/lib/comp-tickets";
import { getEvent } from "@/lib/store";
import { readQuantity } from "@/lib/tickets";

/**
 * POST /api/admin/comp-tickets  { eventId, tierId, quantity, email }
 *
 * Mints free tickets and emails them. Comps draw from the same pool paying
 * buyers do: a sold-out tier refuses rather than conjuring seats, because a
 * door list longer than the room is a fire marshal conversation.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    eventId?: unknown;
    tierId?: unknown;
    quantity?: unknown;
    email?: unknown;
  } | null;

  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const tierId = typeof body?.tierId === "string" ? body.tierId : "";
  const quantity = readQuantity(body?.quantity);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Enter the email the tickets should go to." },
      { status: 400 },
    );
  }

  // Admins can comp any defined tier, hidden and sold-out-flagged included:
  // the flag closes the PUBLIC door, and comps are exactly the back door it
  // leaves for the house.
  const event = await getEvent(eventId).catch(() => null);
  const tier = event?.ticketTiers?.find((row) => row.id === tierId) ?? null;
  if (!event || !event.published || !tier || quantity === null) {
    return NextResponse.json(
      { ok: false, message: "Pick a published event, a ticket type and a count." },
      { status: 400 },
    );
  }

  const issued = await issueCompTickets({ event, tier, quantity, email });
  if (!issued.ok) {
    return NextResponse.json({ ok: false, message: issued.reason }, { status: 409 });
  }

  return NextResponse.json({ ok: true, ref: issued.order.ref });
}

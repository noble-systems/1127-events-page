import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { refundOrderPayment } from "@/lib/square";
import {
  getOrder,
  markSold,
  releaseTickets,
  setTicketRevoked,
  settleOrder,
} from "@/lib/tickets-store";

/**
 * Order administration: the full refund.
 *
 *   POST {refund: ref}
 *
 * Order of operations, deliberately: Square is asked for the money FIRST
 * (idempotent by ref, so a retry cannot double-refund), and only a
 * successful refund flips the order and kills its tickets. A crash between
 * the two leaves money refunded and tickets briefly alive, which the retry
 * fixes; the reverse order could kill tickets without returning a cent.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { refund?: unknown } | null;
  const ref = typeof body?.refund === "string" ? body.refund : "";
  const order = ref ? await getOrder(ref) : null;
  if (!order) {
    return NextResponse.json(
      { ok: false, message: "No order with that ref." },
      { status: 404 },
    );
  }
  if (order.comp === true) {
    return NextResponse.json(
      { ok: false, message: "Comps have no money to refund; void the ticket instead." },
      { status: 400 },
    );
  }
  if (order.status !== "paid") {
    return NextResponse.json(
      { ok: false, message: `Only paid orders refund; this one is ${order.status}.` },
      { status: 409 },
    );
  }
  if (!order.squareOrderId) {
    return NextResponse.json(
      { ok: false, message: "This order has no Square payment attached." },
      { status: 400 },
    );
  }

  try {
    await refundOrderPayment(order.squareOrderId, order.amountCents, order.ref);
  } catch (error) {
    console.error("[1127] refund failed", ref, error);
    return NextResponse.json(
      {
        ok: false,
        message: `Square refused the refund: ${(error as Error).message ?? "unknown error"}`,
      },
      { status: 502 },
    );
  }

  // Money is on its way back; now the tickets die and the seats free up.
  const flipped = await settleOrder(ref, "refunded", {}, "paid");
  if (flipped) {
    for (const code of order.codes ?? []) {
      // Valid tickets revoke; one already scanned stays "used", honestly.
      await setTicketRevoked(code, true).catch((error) =>
        console.error("[1127] refund revoke failed", code, error),
      );
    }
    await markSold(order.eventId, order.tierId, -order.quantity);
    await releaseTickets(order.eventId, order.tierId, order.quantity);

    // The buyer hears it from us, not just from a dead QR at the door.
    if (order.email) {
      const { sendRefundEmail } = await import("@/lib/email");
      const { formatMoney } = await import("@/lib/tickets");
      await sendRefundEmail(order.email, {
        eventName: order.eventName,
        tierName: order.tierName,
        quantity: order.quantity,
        totalLabel: formatMoney(order.amountCents),
      }).catch((error) =>
        console.error("[1127] refund email failed", ref, error),
      );
    }
  }

  return NextResponse.json({ ok: true });
}

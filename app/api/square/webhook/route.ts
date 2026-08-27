import { NextResponse } from "next/server";
import { sendTicketEmail, siteUrl } from "@/lib/email";
import { getEvent, recordSubmission } from "@/lib/store";
import { fetchOrderReference, verifySquareSignature } from "@/lib/square";
import { formatMoney, newTicketCode, sellableTiers } from "@/lib/tickets";
import {
  createTicket,
  getOrder,
  getRefBySquareOrder,
  markSold,
  reserveTickets,
  settleOrder,
} from "@/lib/tickets-store";

/**
 * POST /api/square/webhook
 *
 * Square's side of the conversation. One event matters: payment.updated with
 * status COMPLETED, which means money moved and tickets are owed.
 *
 * Deliveries are authenticated with an HMAC over the exact notification URL
 * plus the RAW body, and they arrive at-least-once, so everything hinges on
 * one conditional write: settleOrder flips pending to paid exactly once, and
 * every redelivery after that is a no-op. The settle happens BEFORE the side
 * effects, so a crash mid-issue can cost one buyer an email (visible on the
 * orders page, recoverable by hand) but can never issue the same tickets
 * twice or double-count a sale.
 *
 * The one genuinely ugly case is a payment that lands AFTER the sweep
 * reclaimed its hold: the recovery path re-reserves the seats, and only if
 * the pool is truly gone does the order become "attention", meaning money
 * with no seats, refund it in Square.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const authentic = verifySquareSignature(
    `${siteUrl()}/api/square/webhook`,
    payload,
    request.headers.get("x-square-hmacsha256-signature"),
  );
  if (!authentic) return NextResponse.json({ ok: false }, { status: 400 });

  const event = (() => {
    try {
      return JSON.parse(payload) as {
        type?: string;
        data?: {
          object?: {
            payment?: {
              status?: string;
              order_id?: string;
              buyer_email_address?: string | null;
            };
          };
        };
      };
    } catch {
      return null;
    }
  })();

  if (event?.type !== "payment.updated") {
    return NextResponse.json({ ok: true, ignored: event?.type ?? "unparsable" });
  }

  const payment = event.data?.object?.payment;
  if (payment?.status !== "COMPLETED" || !payment.order_id) {
    return NextResponse.json({ ok: true, ignored: payment?.status });
  }

  const ref =
    (await getRefBySquareOrder(payment.order_id)) ??
    (await fetchOrderReference(payment.order_id).catch(() => null));
  if (!ref) {
    console.error("[1127] payment for unknown Square order", payment.order_id);
    return NextResponse.json({ ok: true });
  }

  const order = await getOrder(ref);
  if (!order) {
    console.error("[1127] payment names a missing order", ref);
    return NextResponse.json({ ok: true });
  }

  // The address collected on our page wins; the processor's echo is the
  // fallback for orders from before the field existed.
  const email = order.email ?? payment.buyer_email_address ?? null;
  const codes = Array.from({ length: order.quantity }, () => newTicketCode());

  let claimed = await settleOrder(ref, "paid", { email, codes });

  if (!claimed && order.status === "expired") {
    /**
     * The buyer paid a link the sweep was killing. Their hold is gone; take
     * the seats back if any remain, and be loud rather than quiet if not.
     */
    const eventRecord = await getEvent(order.eventId).catch(() => null);
    const tier = eventRecord
      ? sellableTiers(eventRecord).find((row) => row.id === order.tierId)
      : null;
    const reheld = tier
      ? await reserveTickets(order.eventId, tier.id, order.quantity, tier.capacity)
      : false;

    if (reheld) {
      claimed = await settleOrder(ref, "paid", { email, codes }, "expired");
    } else {
      await settleOrder(ref, "attention", { email }, "expired");
      console.error(
        "[1127] ATTENTION: payment landed after its hold lapsed and the tier is full; refund in Square",
        ref,
      );
      return NextResponse.json({ ok: true });
    }
  }

  if (!claimed) return NextResponse.json({ ok: true, already: true });

  try {
    await markSold(order.eventId, order.tierId, order.quantity);

    const now = new Date().toISOString();
    for (const code of codes) {
      // A collision means the code already belongs to somebody; mint again.
      let ok = await createTicket({
        code,
        orderId: order.ref,
        eventId: order.eventId,
        tierId: order.tierId,
        email,
        status: "valid",
        createdAt: now,
      });
      while (!ok) {
        ok = await createTicket({
          code: newTicketCode(),
          orderId: order.ref,
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
        time: eventRecord?.time ?? undefined,
        location: eventRecord?.location,
        walletUrl: `${siteUrl()}/t/${order.ref}`,
      });

      /**
       * The buyer becomes a person in the CRM: attendance recorded against
       * the event, ambassador credit attached, mailable ONLY when the
       * opt-in box was ticked. Buying a ticket is attendance, not a
       * mailing-list signup.
       */
      await recordSubmission("rsvp", {
        name: "",
        email,
        ...(order.phone ? { phone: order.phone } : {}),
        marketingOptIn: order.optIn === true ? "true" : "false",
        ...(order.termsVersion ? { agreeTerms: "true" } : {}),
        eventId: order.eventId,
        ...(order.via ? { via: order.via } : {}),
      }).catch((error) =>
        console.error("[1127] buyer CRM record failed", order.ref, error),
      );
    }
  } catch (error) {
    // The order is settled and the codes are on it; the admin orders page
    // shows everything needed to make this right by hand. Failing the
    // delivery would only replay into the settled gate.
    console.error("[1127] ticket issue failed after settle", ref, error);
  }

  /**
   * The ambassador reward: selling REWARD_EVERY tickets for one event earns
   * one free ticket for that event, once. Not a recurring multiple; selling
   * the threshold again for the same event pays nothing more. claimEventReward
   * succeeds exactly once per (code, event), so two sales settling at once
   * cannot both pay out, and the comp itself is excluded from the sold count
   * so a reward can never earn a reward.
   */
  if (order.via && order.comp !== true) {
    try {
      const { REWARD_EVERY_DEFAULT, ticketsSoldBy } =
        await import("@/lib/ambassadors");
      const {
        claimEventReward,
        getAmbassador,
        getRewardEvery,
        getRewardTierName,
      } = await import("@/lib/ambassadors-store");
      const { listAllOrders } = await import("@/lib/tickets-store");
      const { issueCompTickets } = await import("@/lib/comp-tickets");

      const ambassador = await getAmbassador(order.via);
      if (ambassador?.email) {
        const eventRecord = await getEvent(order.eventId).catch(() => null);
        const eventIds = eventRecord
          ? [eventRecord.id, ...(eventRecord.formerIds ?? [])]
          : [order.eventId];
        const sold = ticketsSoldBy(order.via, await listAllOrders(), eventIds);
        const every = await getRewardEvery(REWARD_EVERY_DEFAULT);
        const alreadyPaid = (ambassador.rewardedEvents ?? []).some((id) =>
          eventIds.includes(id),
        );

        if (
          eventRecord &&
          // Zero threshold = the reward program is switched off entirely.
          every > 0 &&
          sold >= every &&
          !alreadyPaid &&
          (await claimEventReward(order.via, eventRecord.id))
        ) {
          // The dashboard picks the reward type by NAME; a name the sold
          // event does not have falls back to the type that triggered it.
          const wantName = await getRewardTierName();
          const tier =
            eventRecord.ticketTiers?.find(
              (row) => wantName && row.name === wantName,
            ) ?? eventRecord.ticketTiers?.find((row) => row.id === order.tierId);
          const issued = tier
            ? await issueCompTickets({
                event: eventRecord,
                tier,
                quantity: 1,
                email: ambassador.email,
                via: order.via,
                note: `Free, for selling ${every}`,
              })
            : ({ ok: false, reason: "no tier to issue" } as const);
          if (!issued.ok) {
            console.error(
              "[1127] ambassador reward could not issue",
              order.via,
              issued.reason,
            );
          }
        }
      } else if (ambassador) {
        console.error(
          "[1127] ambassador earned a reward but has no email on file",
          order.via,
        );
      }
    } catch (error) {
      console.error("[1127] ambassador reward check failed", order.via, error);
    }
  }

  return NextResponse.json({ ok: true });
}

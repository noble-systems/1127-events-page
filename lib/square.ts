import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventRecord, TicketTier } from "./types.ts";

/**
 * The only file that talks to Square.
 *
 * Payment happens on Square's hosted payment-link page, exactly the shape the
 * Stripe integration had: no card number ever touches this codebase, and the
 * compliance surface is a redirect. Plain REST rather than the Square SDK,
 * because the whole conversation is three endpoints and a webhook signature,
 * and the SDK's BigInt money types and version churn cost more than they buy.
 *
 * One structural difference from Stripe matters everywhere else: payment
 * links do NOT expire on their own and there is no "session expired" webhook.
 * Abandoned holds are reclaimed by the sweep in lib/ticket-sweep.ts instead,
 * which deletes the link BEFORE releasing the seats so a dead link can never
 * be paid.
 *
 * Configuration, absent by default so the site never depends on Square
 * existing:
 *   SQUARE_ACCESS_TOKEN           from the developer dashboard's application
 *   SQUARE_LOCATION_ID            which Square location sales belong to
 *   SQUARE_WEBHOOK_SIGNATURE_KEY  from the webhook subscription
 *   SQUARE_ENVIRONMENT            "sandbox" to test; anything else is live
 */

const ACCESS_TOKEN = () => process.env.SQUARE_ACCESS_TOKEN?.trim();
const LOCATION_ID = () => process.env.SQUARE_LOCATION_ID?.trim();
const SIGNATURE_KEY = () => process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();

export function squareConfigured(): boolean {
  return Boolean(ACCESS_TOKEN() && LOCATION_ID() && SIGNATURE_KEY());
}

function baseUrl(): string {
  // Case-insensitive: "Sandbox" typed in a console field must not silently
  // aim a sandbox token at the production API.
  return process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

async function call<T>(method: string, path: string, body?: object): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN()}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = (await response.json().catch(() => ({}))) as {
    errors?: Array<{ code?: string; detail?: string }>;
  };
  if (!response.ok) {
    const first = data.errors?.[0];
    throw new Error(
      `Square ${method} ${path} answered ${response.status}: ${first?.code ?? "unknown"} ${first?.detail ?? ""}`.trim(),
    );
  }
  return data as T;
}

/**
 * A hosted payment page for one tier. `ref` is OUR order id, minted before
 * this call: it rides on the Square order as reference_id and in the
 * redirect URL, so both the webhook and the thanks page can find their way
 * back to the same order row regardless of which arrives first.
 */
export async function createTicketCheckout(input: {
  event: EventRecord;
  tier: TicketTier;
  quantity: number;
  ref: string;
  siteUrl: string;
  /** Collected on our page; prefills Square so nobody types it twice. */
  buyerEmail?: string;
  buyerPhone?: string;
  /** Overrides the tier price (a signed promo discount); cents per ticket. */
  unitPriceCents?: number;
  /** Shown on the Square line so the receipt explains its own number. */
  discountNote?: string;
}): Promise<{ url: string; squareOrderId: string; linkId: string }> {
  const { event, tier, quantity, ref, siteUrl, buyerEmail } = input;
  const unitPrice = input.unitPriceCents ?? tier.priceCents;
  const digits = (input.buyerPhone ?? "").replace(/[^0-9+]/g, "");
  const buyerPhone =
    /^\+[0-9]{11,15}$/.test(digits)
      ? digits
      : /^[0-9]{10}$/.test(digits)
        ? `+1${digits}`
        : /^1[0-9]{10}$/.test(digits)
          ? `+${digits}`
          : undefined;

  const data = await call<{
    payment_link?: { id?: string; url?: string; order_id?: string };
  }>("POST", "/v2/online-checkout/payment-links", {
    idempotency_key: ref,
    order: {
      location_id: LOCATION_ID(),
      reference_id: ref,
      line_items: [
        {
          name: `${event.name}: ${tier.name}${input.discountNote ? ` ${input.discountNote}` : ""}`,
          quantity: String(quantity),
          base_price_money: { amount: unitPrice, currency: "USD" },
        },
      ],
    },
    checkout_options: {
      redirect_url: `${siteUrl}/tickets/${encodeURIComponent(event.id)}/thanks?ref=${encodeURIComponent(ref)}`,
      allow_tipping: false,
      ask_for_shipping_address: false,
      enable_coupon: false,
      enable_loyalty: false,
    },
    ...(buyerEmail || buyerPhone
      ? {
          pre_populated_data: {
            ...(buyerEmail ? { buyer_email: buyerEmail } : {}),
            ...(buyerPhone ? { buyer_phone_number: buyerPhone } : {}),
          },
        }
      : {}),
  });

  const link = data.payment_link;
  if (!link?.url || !link.order_id || !link.id) {
    throw new Error("Square returned an incomplete payment link.");
  }
  return { url: link.url, squareOrderId: link.order_id, linkId: link.id };
}

/**
 * Kills a payment link. The sweep calls this BEFORE releasing a stale hold:
 * the order of those two operations is what makes "the seats went back on
 * sale" and "the old link still takes money" mutually exclusive.
 */
/**
 * Refunds a payment in full, found through the Square order it settled.
 * The idempotency key is derived from OUR order ref, so a double-click or
 * a retried request can only ever produce one refund.
 */
export async function refundOrderPayment(
  squareOrderId: string,
  amountCents: number,
  ref: string,
  /** Skips the order lookup when the settle already captured the payment. */
  knownPaymentId?: string,
): Promise<{ refundId: string; status: string }> {
  let paymentId = knownPaymentId;
  if (!paymentId) {
    const order = await call<{
      order?: { tenders?: Array<{ id?: string }> };
    }>("GET", `/v2/orders/${encodeURIComponent(squareOrderId)}`);
    paymentId = order.order?.tenders?.[0]?.id;
  }
  if (!paymentId) {
    throw new Error("No payment found on that Square order.");
  }

  const data = await call<{
    refund?: { id?: string; status?: string };
  }>("POST", "/v2/refunds", {
    idempotency_key: `refund-${ref}`,
    payment_id: paymentId,
    amount_money: { amount: amountCents, currency: "USD" },
    reason: "Refunded from the 1127 dashboard",
  });

  if (!data.refund?.id) {
    throw new Error("Square returned no refund.");
  }
  return { refundId: data.refund.id, status: data.refund.status ?? "PENDING" };
}

export async function deletePaymentLink(linkId: string): Promise<void> {
  await call(
    "DELETE",
    `/v2/online-checkout/payment-links/${encodeURIComponent(linkId)}`,
  );
}

/**
 * The reference_id we planted on a Square order, for the webhook fallback
 * when the local alias row is missing (a crash between the two writes).
 */
export async function fetchOrderReference(
  squareOrderId: string,
): Promise<string | null> {
  const data = await call<{ order?: { reference_id?: string } }>(
    "GET",
    `/v2/orders/${encodeURIComponent(squareOrderId)}`,
  );
  return data.order?.reference_id ?? null;
}

/**
 * Square signs webhooks with base64(HMAC-SHA256(key, notificationUrl+body)),
 * where notificationUrl must be the EXACT URL configured on the
 * subscription. Constant-time comparison; a forged delivery reads as absent.
 */
export function verifySquareSignature(
  notificationUrl: string,
  payload: string,
  signature: string | null,
): boolean {
  const key = SIGNATURE_KEY();
  if (!key || !signature) return false;

  const expected = Buffer.from(
    createHmac("sha256", key).update(notificationUrl + payload).digest("base64"),
  );
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

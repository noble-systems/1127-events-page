import Stripe from "stripe";
import type { EventRecord, TicketTier } from "./types.ts";

/**
 * The only file that talks to Stripe.
 *
 * Payment happens on Stripe's hosted Checkout page, not on this site: no card
 * number ever touches this codebase, Apple Pay and Google Pay come free, and
 * the compliance surface is a redirect. This wrapper creates sessions and
 * verifies webhook signatures; everything else about ticketing is ours.
 *
 * Configuration is two environment variables, absent by default:
 *   STRIPE_SECRET_KEY      sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET  whsec_..., from the dashboard's webhook endpoint
 * With them unset, ticket sales report themselves as not configured rather
 * than throwing, so the rest of the site never depends on Stripe existing.
 */

const SECRET = () => process.env.STRIPE_SECRET_KEY?.trim();
const WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET?.trim();

export function stripeConfigured(): boolean {
  return Boolean(SECRET() && WEBHOOK_SECRET());
}

let client: Stripe | null = null;
function stripe(): Stripe {
  const key = SECRET();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!client) client = new Stripe(key);
  return client;
}

/**
 * A Checkout session for one tier. The inventory hold is taken BEFORE this is
 * called and released if the session expires, so the session's lifetime is
 * the hold's lifetime: Stripe's minimum of 30 minutes, then the seats return
 * to the pool by webhook.
 */
export async function createTicketCheckout(input: {
  event: EventRecord;
  tier: TicketTier;
  quantity: number;
  siteUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  const { event, tier, quantity, siteUrl } = input;

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity,
        price_data: {
          currency: "usd",
          unit_amount: tier.priceCents,
          product_data: {
            name: `${event.name}: ${tier.name}`,
            ...(event.date?.trim() ? { description: event.date.trim() } : {}),
          },
        },
      },
    ],
    metadata: {
      eventId: event.id,
      tierId: tier.id,
      quantity: String(quantity),
    },
    // {CHECKOUT_SESSION_ID} is substituted by Stripe, not by us.
    success_url: `${siteUrl}/tickets/${encodeURIComponent(event.id)}/thanks?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/tickets/${encodeURIComponent(event.id)}`,
    // Stripe's floor is 30 minutes; the buffer keeps clock skew from
    // rejecting the request. Expiry fires the webhook that frees the hold.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  });

  if (!session.url) throw new Error("Stripe returned a session with no URL.");
  return { sessionId: session.id, url: session.url };
}

/**
 * Parses and authenticates a webhook delivery. Throws on a bad signature;
 * the caller answers 400 and Stripe retries or gives up as appropriate.
 */
export function verifyStripeEvent(payload: string, signature: string): Stripe.Event {
  const secret = WEBHOOK_SECRET();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripe().webhooks.constructEvent(payload, signature, secret);
}

/** The fields the webhook handler actually reads off a Checkout session. */
export type CheckoutSessionLike = {
  id: string;
  customer_details?: { email?: string | null } | null;
};

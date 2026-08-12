import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, test } from "node:test";

/**
 * Runs against the local JSON driver: cwd must move before the imports below,
 * same load-bearing order as store.test.ts. The webhook tests set fake Stripe
 * secrets and sign payloads themselves, because the signature scheme is
 * public (HMAC over "timestamp.payload") and a webhook handler that has
 * never seen a valid signature in tests is a handler nobody has tested.
 */
process.chdir(mkdtempSync(path.join(tmpdir(), "1127-tickets-")));
process.env.STRIPE_SECRET_KEY = "sk_test_1127_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_1127_test_secret";

const {
  createOrder,
  createTicket,
  getOrder,
  listOrders,
  markSold,
  readInventory,
  releaseTickets,
  renameInventory,
  reserveTickets,
  settleOrder,
} = await import("./tickets-store.ts");
const { newTicketCode } = await import("./tickets.ts");
const { createEvent } = await import("./store/index.ts");
const { POST: webhook } = await import("../app/api/stripe/webhook/route.ts");

async function reset() {
  await rm(path.join(process.cwd(), ".data"), { recursive: true, force: true });
}

const order = (sessionId: string, over: Record<string, unknown> = {}) => ({
  sessionId,
  status: "pending" as const,
  eventId: "mirage",
  tierId: "early-bird",
  eventName: "Mirage",
  tierName: "Early Bird",
  quantity: 2,
  amountCents: 3000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe("the oversell guard", () => {
  beforeEach(reset);

  test("sells to capacity and not one past it", async () => {
    assert.equal(await reserveTickets("mirage", "early-bird", 8, 10), true);
    assert.equal(await reserveTickets("mirage", "early-bird", 2, 10), true);
    assert.equal(
      await reserveTickets("mirage", "early-bird", 1, 10),
      false,
      "the pool is full",
    );
  });

  test("a quantity larger than what's left is refused whole", async () => {
    assert.equal(await reserveTickets("mirage", "ga", 6, 10), true);
    assert.equal(await reserveTickets("mirage", "ga", 5, 10), false);
    assert.equal(
      await reserveTickets("mirage", "ga", 4, 10),
      true,
      "a smaller order still fits",
    );
  });

  test("released holds sell again", async () => {
    assert.equal(await reserveTickets("mirage", "ga", 10, 10), true);
    await releaseTickets("mirage", "ga", 10);
    assert.equal(await reserveTickets("mirage", "ga", 10, 10), true);
  });

  test("a replayed release cannot mint capacity", async () => {
    await reserveTickets("mirage", "ga", 2, 10);
    await releaseTickets("mirage", "ga", 2);
    await releaseTickets("mirage", "ga", 2);
    const inv = await readInventory("mirage", ["ga"]);
    assert.equal(inv.get("ga")?.taken, 0);
  });

  test("counters follow an event rename", async () => {
    await reserveTickets("mirage", "ga", 7, 10);
    await markSold("mirage", "ga", 7);
    await renameInventory("mirage", "mirage-two", ["ga"]);

    const moved = await readInventory("mirage-two", ["ga"]);
    assert.deepEqual(moved.get("ga"), { taken: 7, sold: 7 });
    const old = await readInventory("mirage", ["ga"]);
    assert.deepEqual(old.get("ga"), { taken: 0, sold: 0 });
  });
});

describe("orders settle exactly once", () => {
  beforeEach(reset);

  test("the first settle wins, the redelivery is a no-op", async () => {
    await createOrder(order("cs_1"));
    assert.equal(await settleOrder("cs_1", "paid", { codes: ["AAA-AAA-AAA"] }), true);
    assert.equal(await settleOrder("cs_1", "paid"), false);
    assert.equal(await settleOrder("cs_1", "expired"), false);

    const row = await getOrder("cs_1");
    assert.equal(row?.status, "paid");
    assert.deepEqual(row?.codes, ["AAA-AAA-AAA"]);
  });

  test("a duplicate ticket code is refused", async () => {
    const ticket = {
      code: newTicketCode(),
      orderId: "cs_1",
      eventId: "mirage",
      tierId: "ga",
      email: null,
      status: "valid" as const,
      createdAt: new Date().toISOString(),
    };
    assert.equal(await createTicket(ticket), true);
    assert.equal(await createTicket(ticket), false);
  });

  test("orders are found under former event ids too", async () => {
    await createOrder(order("cs_old", { eventId: "sun-club" }));
    await createOrder(order("cs_new", { eventId: "mirage" }));
    const rows = await listOrders(["mirage", "sun-club"]);
    assert.equal(rows.length, 2);
  });
});

/* -------------------------------------------------------------------------- */
/* The webhook, driven exactly as Stripe drives it                            */
/* -------------------------------------------------------------------------- */

function signedRequest(body: object): Request {
  const payload = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

const completedEvent = (sessionId: string, email = "buyer@example.com") => ({
  id: "evt_test_1",
  type: "checkout.session.completed",
  data: { object: { id: sessionId, customer_details: { email } } },
});

describe("the Stripe webhook", () => {
  beforeEach(reset);

  test("a forged signature is refused", async () => {
    const payload = JSON.stringify(completedEvent("cs_x"));
    const response = await webhook(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
        body: payload,
      }),
    );
    assert.equal(response.status, 400);
  });

  test("completed: settles, counts the sale, issues one code per ticket", async () => {
    await createEvent({
      id: "mirage",
      name: "Mirage",
      tagline: "t",
      summary: "s",
      heroBody: "",
      status: "On sale",
      date: "Aug 30",
      location: "Old Town",
      venue: null,
      tags: [],
      genres: [],
      tone: "dusk",
      featured: false,
      published: true,
      rsvpEnabled: true,
      order: 0,
      shotNote: "",
      image: null,
      imageAlt: "",
      ctaLabel: "Tickets",
      ctaAction: "tickets",
      emailSubject: null,
      emailHeading: null,
      emailBody: null,
    } as never);
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("cs_paid"));

    const response = await webhook(signedRequest(completedEvent("cs_paid")));
    assert.equal(response.status, 200);

    const row = await getOrder("cs_paid");
    assert.equal(row?.status, "paid");
    assert.equal(row?.email, "buyer@example.com");
    assert.equal(row?.codes?.length, 2, "one code per ticket bought");

    const inv = await readInventory("mirage", ["early-bird"]);
    assert.deepEqual(inv.get("early-bird"), { taken: 2, sold: 2 });
  });

  test("a redelivered completed event changes nothing", async () => {
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("cs_dup"));

    await webhook(signedRequest(completedEvent("cs_dup")));
    const first = await getOrder("cs_dup");
    await webhook(signedRequest(completedEvent("cs_dup")));
    const second = await getOrder("cs_dup");

    assert.deepEqual(second?.codes, first?.codes, "codes were not reissued");
    const inv = await readInventory("mirage", ["early-bird"]);
    assert.equal(inv.get("early-bird")?.sold, 2, "the sale counted once");
  });

  test("expired: releases the hold so the seats sell again", async () => {
    await reserveTickets("mirage", "early-bird", 25, 25);
    await createOrder(order("cs_gone", { quantity: 25 }));

    const response = await webhook(
      signedRequest({
        id: "evt_test_2",
        type: "checkout.session.expired",
        data: { object: { id: "cs_gone" } },
      }),
    );
    assert.equal(response.status, 200);

    assert.equal((await getOrder("cs_gone"))?.status, "expired");
    assert.equal(
      await reserveTickets("mirage", "early-bird", 25, 25),
      true,
      "the whole pool is sellable again",
    );
  });

  test("expiry after payment cannot claw back a sale", async () => {
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("cs_race"));
    await webhook(signedRequest(completedEvent("cs_race")));

    await webhook(
      signedRequest({
        id: "evt_test_3",
        type: "checkout.session.expired",
        data: { object: { id: "cs_race" } },
      }),
    );

    assert.equal((await getOrder("cs_race"))?.status, "paid");
    const inv = await readInventory("mirage", ["early-bird"]);
    assert.equal(inv.get("early-bird")?.taken, 2, "the hold stayed converted");
  });
});

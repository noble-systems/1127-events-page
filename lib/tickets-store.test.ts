import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, test } from "node:test";

/**
 * Runs against the local JSON driver: cwd must move before the imports below,
 * same load-bearing order as store.test.ts. The webhook tests set a fake
 * Square signature key and sign payloads themselves, because the scheme is
 * public (base64 HMAC over notificationUrl + body) and a webhook handler that
 * has never seen a valid signature in tests is a handler nobody has tested.
 */
process.chdir(mkdtempSync(path.join(tmpdir(), "1127-tickets-")));
process.env.SQUARE_ACCESS_TOKEN = "sq_test_1127_fake";
process.env.SQUARE_LOCATION_ID = "L1127TEST";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "sig_1127_test_key";

const {
  createOrder,
  createTicket,
  getOrder,
  getRefBySquareOrder,
  listOrders,
  markSold,
  readInventory,
  releaseTickets,
  renameInventory,
  reserveTickets,
  settleOrder,
} = await import("./tickets-store.ts");
const { newTicketCode } = await import("./tickets.ts");
const { sweepStaleHolds } = await import("./ticket-sweep.ts");
const { siteUrl } = await import("./email.ts");
const { createEvent, listSubmissions } = await import("./store/index.ts");
const { POST: webhook } = await import("../app/api/square/webhook/route.ts");

async function reset() {
  await rm(path.join(process.cwd(), ".data"), { recursive: true, force: true });
}

const order = (ref: string, over: Record<string, unknown> = {}) => ({
  ref,
  status: "pending" as const,
  eventId: "mirage",
  tierId: "early-bird",
  eventName: "Mirage",
  tierName: "Early Bird",
  quantity: 2,
  amountCents: 3000,
  squareOrderId: `sq-${ref}`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

/** An event whose early-bird tier exists, for the webhook's recovery path. */
async function seedEvent() {
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
    ticketsEnabled: true,
    ticketTiers: [
      { id: "early-bird", name: "Early Bird", priceCents: 1500, capacity: 25 },
    ],
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
}

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
    await createOrder(order("r1"));
    assert.equal(await settleOrder("r1", "paid", { codes: ["AAA-AAA-AAA"] }), true);
    assert.equal(await settleOrder("r1", "paid"), false);
    assert.equal(await settleOrder("r1", "expired"), false);

    const row = await getOrder("r1");
    assert.equal(row?.status, "paid");
    assert.deepEqual(row?.codes, ["AAA-AAA-AAA"]);
  });

  test("settling from a named status only moves that status", async () => {
    await createOrder(order("r2"));
    await settleOrder("r2", "expired");
    assert.equal(
      await settleOrder("r2", "paid", {}, "pending"),
      false,
      "expired is not pending",
    );
    assert.equal(await settleOrder("r2", "paid", {}, "expired"), true);
    assert.equal((await getOrder("r2"))?.status, "paid");
  });

  test("a Square order id finds its ref", async () => {
    await createOrder(order("r3"));
    assert.equal(await getRefBySquareOrder("sq-r3"), "r3");
    assert.equal(await getRefBySquareOrder("sq-nope"), null);
  });

  test("a duplicate ticket code is refused", async () => {
    const ticket = {
      code: newTicketCode(),
      orderId: "r1",
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
    await createOrder(order("r-old", { eventId: "sun-club" }));
    await createOrder(order("r-new", { eventId: "mirage" }));
    const rows = await listOrders(["mirage", "sun-club"]);
    assert.equal(rows.length, 2);
  });
});

/* -------------------------------------------------------------------------- */
/* The sweep: Square links do not expire themselves                           */
/* -------------------------------------------------------------------------- */

describe("sweepStaleHolds", () => {
  beforeEach(reset);

  const MIN = 60_000;

  test("an abandoned hold is reclaimed after the window", async () => {
    await reserveTickets("mirage", "early-bird", 25, 25);
    await createOrder(
      order("stale", {
        quantity: 25,
        createdAt: new Date(Date.now() - 40 * MIN).toISOString(),
      }),
    );

    const freed = await sweepStaleHolds(["mirage"], "early-bird", Date.now());
    assert.equal(freed, 25);
    assert.equal((await getOrder("stale"))?.status, "expired");
    assert.equal(
      await reserveTickets("mirage", "early-bird", 25, 25),
      true,
      "the whole pool is sellable again",
    );
  });

  test("a young hold is left alone", async () => {
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("young"));

    const freed = await sweepStaleHolds(["mirage"], "early-bird", Date.now());
    assert.equal(freed, 0);
    assert.equal((await getOrder("young"))?.status, "pending");
  });

  test("paid orders are never swept", async () => {
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(
      order("paid-old", {
        createdAt: new Date(Date.now() - 90 * MIN).toISOString(),
      }),
    );
    await settleOrder("paid-old", "paid");

    const freed = await sweepStaleHolds(["mirage"], "early-bird", Date.now());
    assert.equal(freed, 0);
    const inv = await readInventory("mirage", ["early-bird"]);
    assert.equal(inv.get("early-bird")?.taken, 2, "the sale kept its seats");
  });
});

/* -------------------------------------------------------------------------- */
/* The webhook, driven exactly as Square drives it                            */
/* -------------------------------------------------------------------------- */

function signedRequest(body: object): Request {
  const payload = JSON.stringify(body);
  const url = `${siteUrl()}/api/square/webhook`;
  const signature = createHmac(
    "sha256",
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
  )
    .update(url + payload)
    .digest("base64");
  return new Request("http://localhost/api/square/webhook", {
    method: "POST",
    headers: { "x-square-hmacsha256-signature": signature },
    body: payload,
  });
}

const completedEvent = (squareOrderId: string, email = "buyer@example.com") => ({
  type: "payment.updated",
  event_id: "evt_1",
  data: {
    object: {
      payment: {
        id: "pay_1",
        status: "COMPLETED",
        order_id: squareOrderId,
        buyer_email_address: email,
      },
    },
  },
});

describe("the Square webhook", () => {
  beforeEach(reset);

  test("a forged signature is refused", async () => {
    const response = await webhook(
      new Request("http://localhost/api/square/webhook", {
        method: "POST",
        headers: { "x-square-hmacsha256-signature": "bm90IHJlYWw=" },
        body: JSON.stringify(completedEvent("sq-x")),
      }),
    );
    assert.equal(response.status, 400);
  });

  test("completed: settles, counts the sale, issues one code per ticket", async () => {
    await seedEvent();
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("rp"));

    const response = await webhook(signedRequest(completedEvent("sq-rp")));
    assert.equal(response.status, 200);

    const row = await getOrder("rp");
    assert.equal(row?.status, "paid");
    assert.equal(row?.email, "buyer@example.com");
    assert.equal(row?.codes?.length, 2, "one code per ticket bought");

    const inv = await readInventory("mirage", ["early-bird"]);
    assert.deepEqual(inv.get("early-bird"), { taken: 2, sold: 2 });
  });

  test("a redelivered completed event changes nothing", async () => {
    await seedEvent();
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("rd"));

    await webhook(signedRequest(completedEvent("sq-rd")));
    const first = await getOrder("rd");
    await webhook(signedRequest(completedEvent("sq-rd")));
    const second = await getOrder("rd");

    assert.deepEqual(second?.codes, first?.codes, "codes were not reissued");
    const inv = await readInventory("mirage", ["early-bird"]);
    assert.equal(inv.get("early-bird")?.sold, 2, "the sale counted once");
  });

  /**
   * The race the sweep creates: a buyer pays in the seconds between the link
   * being killed and the hold released. Seats remain, so the order revives.
   */
  test("payment after a sweep re-reserves and still issues", async () => {
    await seedEvent();
    await createOrder(order("late"));
    await settleOrder("late", "expired");

    const response = await webhook(signedRequest(completedEvent("sq-late")));
    assert.equal(response.status, 200);

    const row = await getOrder("late");
    assert.equal(row?.status, "paid");
    assert.equal(row?.codes?.length, 2);
    const inv = await readInventory("mirage", ["early-bird"]);
    assert.deepEqual(inv.get("early-bird"), { taken: 2, sold: 2 });
  });

  test("payment after a sweep with the tier resold goes to attention", async () => {
    await seedEvent();
    await createOrder(order("bad", { quantity: 2 }));
    await settleOrder("bad", "expired");
    // Somebody else took every seat in between.
    await reserveTickets("mirage", "early-bird", 25, 25);

    const response = await webhook(signedRequest(completedEvent("sq-bad")));
    assert.equal(response.status, 200);

    const row = await getOrder("bad");
    assert.equal(row?.status, "attention");
    assert.equal(row?.codes, undefined, "no codes for seats that don't exist");
    const inv = await readInventory("mirage", ["early-bird"]);
    assert.equal(inv.get("early-bird")?.sold, 0, "nothing was counted sold");
  });
});

/* -------------------------------------------------------------------------- */
/* Ambassador rows                                                            */
/* -------------------------------------------------------------------------- */

const { activeAmbassadorCode, createAmbassador, listAmbassadors, setAmbassadorActive } =
  await import("./ambassadors-store.ts");

describe("the ambassador roster", () => {
  beforeEach(reset);

  const dani = {
    code: "DANI",
    name: "Daniela",
    active: true,
    createdAt: new Date().toISOString(),
  };

  test("a code exists once", async () => {
    assert.equal(await createAmbassador(dani), true);
    assert.equal(await createAmbassador(dani), false);
    assert.equal((await listAmbassadors()).length, 1);
  });

  test("only active codes attribute", async () => {
    await createAmbassador(dani);
    assert.equal(await activeAmbassadorCode("DANI"), "DANI");
    assert.equal(await activeAmbassadorCode("NOBODY"), null);
    assert.equal(await activeAmbassadorCode(""), null);

    await setAmbassadorActive("DANI", false);
    assert.equal(await activeAmbassadorCode("DANI"), null, "switched off");
    await setAmbassadorActive("DANI", true);
    assert.equal(await activeAmbassadorCode("DANI"), "DANI", "and back on");
  });
});

describe("buyer contact collected on our page", () => {
  beforeEach(reset);

  test("our email beats the processor echo, and the buyer lands in the CRM", async () => {
    await seedEvent();
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(
      order("crm", {
        email: "ours@example.com",
        phone: "480-555-0123",
        optIn: true,
        via: "DANI",
      }),
    );

    await webhook(signedRequest(completedEvent("sq-crm", "square@example.com")));

    const row = await getOrder("crm");
    assert.equal(row?.email, "ours@example.com", "collected address wins");

    const people = await listSubmissions("rsvp");
    assert.equal(people.length, 1);
    assert.equal(people[0].email, "ours@example.com");
    assert.equal(people[0].phone, "480-555-0123");
    assert.equal(people[0].marketingOptIn, true, "box was ticked");
    assert.equal(people[0].via, "DANI", "ambassador credit carried");
    assert.deepEqual(people[0].eventIds, ["mirage"], "attendance recorded");
  });

  test("no opt-in means present in CRM but not mailable", async () => {
    await seedEvent();
    await reserveTickets("mirage", "early-bird", 2, 25);
    await createOrder(order("quiet", { email: "quiet@example.com" }));

    await webhook(signedRequest(completedEvent("sq-quiet")));

    const people = await listSubmissions("rsvp");
    assert.equal(people.length, 1);
    assert.equal(people[0].marketingOptIn, false);
  });
});

describe("the door", () => {
  beforeEach(reset);

  const issue = async (code: string) =>
    createTicket({
      code,
      orderId: "r-door",
      eventId: "mirage",
      tierId: "early-bird",
      email: "guest@example.com",
      status: "valid",
      createdAt: new Date().toISOString(),
    });

  test("a ticket checks in exactly once", async () => {
    const { getTicket, checkInTicket } = await import("./tickets-store.ts");
    await issue("AAA-BBB-CCC");

    const first = await checkInTicket("AAA-BBB-CCC");
    assert.equal(first.ok, true);
    assert.equal(first.ticket?.status, "used");
    assert.ok(first.ticket?.usedAt, "the walk-in time is stamped");

    const second = await checkInTicket("AAA-BBB-CCC");
    assert.equal(second.ok, false, "the screenshot bounces");
    assert.equal(second.ticket?.status, "used");
    assert.equal(
      second.ticket?.usedAt,
      first.ticket?.usedAt,
      "the original stamp survives",
    );
    assert.equal((await getTicket("AAA-BBB-CCC"))?.status, "used");
  });

  test("an unknown code is nobody's ticket", async () => {
    const { checkInTicket } = await import("./tickets-store.ts");
    const out = await checkInTicket("ZZZ-ZZZ-ZZZ");
    assert.equal(out.ok, false);
    assert.equal(out.ticket, null);
  });
});

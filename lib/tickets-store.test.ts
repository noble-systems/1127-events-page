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
    tags: [],
    genres: [],
    tone: "dusk",
    featured: false,
    published: true,
    rsvpEnabled: true,
    ticketsEnabled: true,
    ticketTiers: [
      { id: "early-bird", name: "Early Bird", priceCents: 1500, capacity: 25 },
      { id: "ga", name: "General Admission", priceCents: 2500, capacity: 100 },
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

/* -------------------------------------------------------------------------- */
/* Door passes and their sessions                                             */
/* -------------------------------------------------------------------------- */

const { createDoorPass, findDoorPassByPin, getDoorPass, patchDoorPass } =
  await import("./door-store.ts");
const { mintDoorToken } = await import("./door-auth.ts");
const { verifyToken } = await import("./tokens.ts");

describe("door passes", () => {
  beforeEach(reset);

  test("a pass opens by PIN while active, and not after", async () => {
    const pass = await createDoorPass("Marco");
    assert.match(pass.pin, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal((await findDoorPassByPin(pass.pin))?.id, pass.id);

    await patchDoorPass(pass.id, { active: false });
    assert.equal(await findDoorPassByPin(pass.pin), null, "deactivated");
    await patchDoorPass(pass.id, { active: true });
    assert.equal((await findDoorPassByPin(pass.pin))?.id, pass.id, "and back");
  });

  test("revoking sessions outlives the cookie but not the PIN", async () => {
    const pass = await createDoorPass("west door");
    const issuedBefore = Date.now() - 1000;
    const token = mintDoorToken(pass.id, issuedBefore);
    const claims = verifyToken(token);
    assert.equal((claims as { door?: string })?.door, pass.id);

    await patchDoorPass(pass.id, { revokedAfter: Date.now() });
    const revoked = await getDoorPass(pass.id);
    // The auth layer refuses cookies born before revokedAfter; the pass and
    // its PIN stay usable for a fresh sign-in.
    assert.ok(revoked?.revokedAfter && issuedBefore <= revoked.revokedAfter);
    assert.equal(revoked?.active, true);
    assert.equal((await findDoorPassByPin(pass.pin))?.id, pass.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Comps and the ambassador reward                                            */
/* -------------------------------------------------------------------------- */

const { issueCompTickets } = await import("./comp-tickets.ts");
const { createAmbassador: mintAmb, getAmbassador: readAmb } = await import(
  "./ambassadors-store.ts"
);

describe("comp tickets", () => {
  beforeEach(reset);

  test("a comp settles paid at zero dollars with real codes and seats", async () => {
    await seedEvent();
    const event = (await (await import("./store/index.ts")).getEvent("mirage"))!;
    const tier = event.ticketTiers![0];

    const out = await issueCompTickets({
      event,
      tier,
      quantity: 2,
      email: "guest@example.com",
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.order.comp, true);
    assert.equal(out.order.amountCents, 0);
    assert.equal(out.order.codes?.length, 2);

    const inv = await readInventory("mirage", ["early-bird"]);
    assert.deepEqual(inv.get("early-bird"), { taken: 2, sold: 2 });
  });

  test("a full tier refuses the comp instead of overfilling", async () => {
    await seedEvent();
    await reserveTickets("mirage", "early-bird", 25, 25);
    const event = (await (await import("./store/index.ts")).getEvent("mirage"))!;
    const out = await issueCompTickets({
      event,
      tier: event.ticketTiers![0],
      quantity: 1,
      email: "guest@example.com",
    });
    assert.equal(out.ok, false);
  });
});

const { scheduleChanged, notifyScheduleChange } = await import(
  "./schedule-notify.ts"
);

describe("schedule-change notice", () => {
  beforeEach(reset);

  test("only a moved date or changed hours count as a schedule change", () => {
    const before = { date: "Aug 30", time: "12-4 PM" };
    assert.equal(scheduleChanged(before, { date: "Sep 6", time: "12-4 PM" }), true);
    assert.equal(scheduleChanged(before, { date: "Aug 30", time: "1-5 PM" }), true);
    assert.equal(scheduleChanged(before, { date: "Aug 30", time: "12-4 PM" }), false);
    // Whitespace and a missing field are not a change.
    assert.equal(scheduleChanged({ date: "Aug 30", time: null }, { date: " Aug 30 ", time: "" }), false);
  });

  test("every paid order with an email gets one notice", async () => {
    await seedEvent();
    for (const ref of ["n1", "n2"]) {
      await reserveTickets("mirage", "early-bird", 1, 25);
      await createOrder(order(ref, { quantity: 1, email: "b@x.co" }));
      await webhook(signedRequest(completedEvent(`sq-${ref}`)));
    }
    // A pending order holds no tickets yet, so it gets nothing.
    await reserveTickets("mirage", "early-bird", 1, 25);
    await createOrder(order("n3", { quantity: 1, email: "c@x.co" }));

    const event = (await (await import("./store/index.ts")).getEvent("mirage"))!;
    const sent = await notifyScheduleChange(event);
    assert.equal(sent, 2, "the two paid orders, not the pending one");
  });
});

describe("refunding an order", () => {
  beforeEach(reset);

  test("paid flips to refunded once, tickets die, seats free", async () => {
    await seedEvent();
    await reserveTickets("mirage", "ga", 2, 100);
    await createOrder(order("rf1", { tierId: "ga", quantity: 2 }));
    const codes = [newTicketCode(), newTicketCode()];
    await settleOrder("rf1", "paid", { codes });
    await markSold("mirage", "ga", 2);
    for (const code of codes) {
      await createTicket({
        code,
        orderId: "rf1",
        eventId: "mirage",
        tierId: "ga",
        email: null,
        status: "valid",
        createdAt: new Date().toISOString(),
      });
    }

    // The state flip the refund route performs after Square says yes.
    assert.equal(await settleOrder("rf1", "refunded", {}, "paid"), true);
    assert.equal(
      await settleOrder("rf1", "refunded", {}, "paid"),
      false,
      "a second flip finds nothing to flip",
    );
    const { setTicketRevoked } = await import("./tickets-store.ts");
    for (const code of codes) await setTicketRevoked(code, true);
    await markSold("mirage", "ga", -2);
    await releaseTickets("mirage", "ga", 2);

    assert.equal((await getOrder("rf1"))?.status, "refunded");
    const inv = await readInventory("mirage", ["ga"]);
    assert.deepEqual(inv.get("ga"), { taken: 0, sold: 0 });
    const { checkInTicket } = await import("./tickets-store.ts");
    assert.equal((await checkInTicket(codes[0])).ok, false, "door says no");
  });
});

describe("voiding a comp ticket", () => {
  beforeEach(reset);

  test("valid flips to revoked, the door refuses it, restore flips back", async () => {
    const { setTicketRevoked, checkInTicket } = await import(
      "./tickets-store.ts"
    );
    const code = newTicketCode();
    await createTicket({
      code,
      orderId: "comp-1",
      eventId: "mirage",
      tierId: "ga",
      email: null,
      status: "valid",
      createdAt: new Date().toISOString(),
    });

    assert.equal((await setTicketRevoked(code, true)).ok, true);
    assert.equal((await checkInTicket(code)).ok, false, "the door says no");
    // Replayed void is a no-op, not a crash.
    assert.equal((await setTicketRevoked(code, true)).ok, false);

    assert.equal((await setTicketRevoked(code, false)).ok, true);
    assert.equal((await checkInTicket(code)).ok, true, "valid again scans");
  });

  test("a scanned ticket cannot be voided", async () => {
    const { setTicketRevoked, checkInTicket } = await import(
      "./tickets-store.ts"
    );
    const code = newTicketCode();
    await createTicket({
      code,
      orderId: "comp-2",
      eventId: "mirage",
      tierId: "ga",
      email: null,
      status: "valid",
      createdAt: new Date().toISOString(),
    });
    await checkInTicket(code);
    const out = await setTicketRevoked(code, true);
    assert.equal(out.ok, false);
    assert.equal(out.ticket?.status, "used");
  });
});

describe("ambassador onboarding", () => {
  beforeEach(reset);

  test("welcome template and onboard ticket settings round trip", async () => {
    const {
      getOnboardTicket,
      getWelcomeTemplate,
      setOnboardTicket,
      setWelcomeTemplate,
      listAmbassadors,
    } = await import("./ambassadors-store.ts");

    assert.deepEqual(await getWelcomeTemplate(), { subject: "", body: "" });
    await setWelcomeTemplate({ subject: "Welcome", body: "Hi {name}, {link}" });
    assert.equal((await getWelcomeTemplate()).body, "Hi {name}, {link}");

    await setOnboardTicket({ eventId: "mirage", tierId: "ga" });
    assert.deepEqual(await getOnboardTicket(), {
      eventId: "mirage",
      tierId: "ga",
    });

    // The cfg stand-in rows never leak into the roster listing.
    assert.equal((await listAmbassadors()).length, 0);
  });

  test("the welcome email fills placeholders and escapes nothing dangerous in", async () => {
    const { renderAmbassadorWelcomeEmail } = await import("./email.ts");
    const { subject, html, text } = renderAmbassadorWelcomeEmail({
      name: "Dani Q",
      code: "DANI",
      link: "https://1127.events/a/DANI",
      statsLink: "https://1127.events/me/abcdefgh2345",
      subject: "",
      body: "Hey {name}, your code is {code}: {link} {stats} <script>x</script>",
    });
    assert.equal(subject, "Your 1127 ambassador link");
    assert.ok(text.includes("Hey Dani, your code is DANI"));
    assert.ok(html.includes("https://1127.events/a/DANI"));
    assert.ok(html.includes("/me/abcdefgh2345"));
    assert.ok(!html.includes("<script>x</script>"), "markup escaped");
  });

  test("the {event} placeholder and the material images render in", async () => {
    const { renderAmbassadorWelcomeEmail } = await import("./email.ts");
    const { html, text } = renderAmbassadorWelcomeEmail({
      name: "Dani",
      code: "DANI",
      link: "https://1127.events/a/DANI",
      eventName: "Mirage at Solaya",
      kitImages: ["https://img.example/kit/material-1.jpg"],
      subject: "",
      body: "Post about {event} this week.",
    });
    assert.ok(html.includes("Post about Mirage at Solaya this week."));
    assert.ok(html.includes("https://img.example/kit/material-1.jpg"));
    assert.ok(html.includes("Material to post"));
    assert.ok(text.includes("https://img.example/kit/material-1.jpg"));
  });

  test("kit image refs round trip and reject junk order-preserving", async () => {
    const { getKitImages, setKitImages } = await import("./ambassadors-store.ts");
    assert.deepEqual(await getKitImages(), []);
    await setKitImages(["s3:kit/material-a.jpg", "s3:kit/material-b.png"]);
    assert.deepEqual(await getKitImages(), [
      "s3:kit/material-a.jpg",
      "s3:kit/material-b.png",
    ]);
  });

  test("a stats id finds its ambassador and nothing else does", async () => {
    const { getAmbassadorByStatsId, newStatsId } = await import(
      "./ambassadors-store.ts"
    );
    const statsId = newStatsId();
    assert.match(statsId, /^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/);
    await mintAmb({
      code: "LILA",
      name: "Lila",
      email: "lila@example.com",
      active: true,
      statsId,
      createdAt: new Date().toISOString(),
    });
    assert.equal((await getAmbassadorByStatsId(statsId))?.code, "LILA");
    assert.equal(await getAmbassadorByStatsId("zzzzzzzzzzzz"), null);
    assert.equal(await getAmbassadorByStatsId("LILA"), null, "codes are not ids");
  });
});

describe("the ambassador reward", () => {
  beforeEach(reset);

  test("the third sold ticket sends a free one, once per event ever", async () => {
    await seedEvent();
    await mintAmb({
      code: "DANI",
      name: "Daniela",
      email: "dani@example.com",
      active: true,
      createdAt: new Date().toISOString(),
    });

    // Three separate one-ticket sales through the code.
    for (const ref of ["s1", "s2", "s3"]) {
      await reserveTickets("mirage", "early-bird", 1, 25);
      await createOrder(order(ref, { quantity: 1, via: "DANI", email: "b@x.co" }));
      await webhook(signedRequest(completedEvent(`sq-${ref}`)));
    }

    const amb = await readAmb("DANI");
    assert.deepEqual(amb?.rewardedEvents, ["mirage"], "the event paid out");

    const all = await listOrders(["mirage"]);
    const comps = all.filter((row) => row.comp === true);
    assert.equal(comps.length, 1, "exactly one free ticket");
    assert.equal(comps[0].email, "dani@example.com");
    assert.equal(comps[0].via, "DANI");
    assert.equal(comps[0].amountCents, 0);

    // The comp itself never counts toward the next reward.
    const { ticketsSoldBy } = await import("./ambassadors.ts");
    assert.equal(ticketsSoldBy("DANI", all), 3);

    // Redelivering the third sale's webhook changes nothing.
    await webhook(signedRequest(completedEvent("sq-s3")));
    assert.equal(
      (await listOrders(["mirage"])).filter((row) => row.comp === true).length,
      1,
    );

    // Three MORE sales for the same event: still one free ticket, forever.
    for (const ref of ["s4", "s5", "s6"]) {
      await reserveTickets("mirage", "early-bird", 1, 25);
      await createOrder(order(ref, { quantity: 1, via: "DANI", email: "b@x.co" }));
      await webhook(signedRequest(completedEvent(`sq-${ref}`)));
    }
    assert.equal(
      (await listOrders(["mirage"])).filter((row) => row.comp === true).length,
      1,
      "six sold for one event still pays exactly one free ticket",
    );
  });

  test("the free ticket is the type the dashboard picked", async () => {
    await seedEvent();
    const { setRewardTierName } = await import("./ambassadors-store.ts");
    await setRewardTierName("General Admission");
    await mintAmb({
      code: "LUZ",
      name: "Luz",
      email: "luz@example.com",
      active: true,
      createdAt: new Date().toISOString(),
    });

    // Three early-bird sales; the reward comes back as GA anyway.
    for (const ref of ["g1", "g2", "g3"]) {
      await reserveTickets("mirage", "early-bird", 1, 25);
      await createOrder(order(ref, { quantity: 1, via: "LUZ", email: "b@x.co" }));
      await webhook(signedRequest(completedEvent(`sq-${ref}`)));
    }

    const comps = (await listOrders(["mirage"])).filter(
      (row) => row.comp === true,
    );
    assert.equal(comps.length, 1);
    assert.equal(comps[0].tierId, "ga", "the comp is the picked type");
    assert.equal(comps[0].amountCents, 0);

    const inv = await readInventory("mirage", ["ga"]);
    assert.equal(inv.get("ga")?.sold, 1, "the free seat came from the GA pool");
  });

  test("a zero threshold switches the reward off entirely", async () => {
    await seedEvent();
    const { setRewardEvery } = await import("./ambassadors-store.ts");
    await setRewardEvery(0);
    await mintAmb({
      code: "NORA",
      name: "Nora",
      email: "nora@example.com",
      active: true,
      createdAt: new Date().toISOString(),
    });

    for (const ref of ["z1", "z2", "z3"]) {
      await reserveTickets("mirage", "early-bird", 1, 25);
      await createOrder(order(ref, { quantity: 1, via: "NORA", email: "b@x.co" }));
      await webhook(signedRequest(completedEvent(`sq-${ref}`)));
    }

    assert.equal(
      (await listOrders(["mirage"])).filter((row) => row.comp === true).length,
      0,
      "no free ticket while the program is off",
    );
  });

  test("no email on file means no reward and a loud log, not a crash", async () => {
    await seedEvent();
    await mintAmb({
      code: "MARCO",
      name: "Marco",
      active: true,
      createdAt: new Date().toISOString(),
    });

    for (const ref of ["m1", "m2", "m3"]) {
      await reserveTickets("mirage", "early-bird", 1, 25);
      await createOrder(order(ref, { quantity: 1, via: "MARCO", email: "b@x.co" }));
      await webhook(signedRequest(completedEvent(`sq-${ref}`)));
    }

    assert.equal(((await readAmb("MARCO"))?.rewardedEvents ?? []).length, 0);
    assert.equal(
      (await listOrders(["mirage"])).filter((row) => row.comp === true).length,
      0,
    );
  });
});

describe("renaming an ambassador code", () => {
  beforeEach(reset);

  test("history, clicks and identity all follow; the old code dies", async () => {
    const { renameAmbassador } = await import("./ambassador-admin.ts");
    const { bumpAmbassadorClicks, readAmbassadorClicks } = await import(
      "./ambassadors-store.ts"
    );

    await mintAmb({
      code: "DANI",
      name: "Daniela",
      email: "dani@example.com",
      active: true,
      createdAt: new Date().toISOString(),
    });
    await createOrder(order("rv", { via: "DANI" }));
    await settleOrder("rv", "paid");
    await bumpAmbassadorClicks("DANI");

    const out = await renameAmbassador("DANI", "DANIELA");
    assert.equal(out.ok, true);

    assert.equal(await readAmb("DANI"), null, "old code gone");
    const renamed = await readAmb("DANIELA");
    assert.equal(renamed?.email, "dani@example.com");

    const orders = await listOrders(["mirage"]);
    assert.equal(orders[0]?.via, "DANIELA", "sale history moved");

    const clicks = await readAmbassadorClicks(["DANIELA"]);
    assert.equal(clicks.get("DANIELA"), 1, "taps moved");
  });

  test("a taken code refuses", async () => {
    const { renameAmbassador } = await import("./ambassador-admin.ts");
    await mintAmb({ code: "AAA", name: "A", active: true, createdAt: new Date().toISOString() });
    await mintAmb({ code: "BBB", name: "B", active: true, createdAt: new Date().toISOString() });
    const out = await renameAmbassador("AAA", "BBB");
    assert.equal(out.ok, false);
  });
});

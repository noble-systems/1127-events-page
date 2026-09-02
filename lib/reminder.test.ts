import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

// The promo-code store writes .data files; keep them in a scratch dir.
process.chdir(mkdtempSync(path.join(tmpdir(), "1127-reminder-")));

const {
  computeReminderTargets,
  createPromoCode,
  discountedUnitCents,
  getPromoCode,
  markPromoUsed,
  newPromoId,
  setReminderSettings,
  validatePromo,
} = await import("./reminder.ts");
import type { TicketOrder } from "./tickets.ts";
import type { SubmissionRecord } from "./types.ts";

const order = (over: Partial<TicketOrder>): TicketOrder => ({
  ref: Math.random().toString(36).slice(2),
  status: "expired",
  eventId: "mirage",
  tierId: "ga",
  eventName: "Mirage",
  tierName: "GA",
  quantity: 1,
  amountCents: 2000,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const sub = (email: string, status: SubmissionRecord["status"]): SubmissionRecord =>
  ({
    pk: `rsvp#${email}`,
    type: "rsvp",
    email,
    name: "",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    status,
  }) as SubmissionRecord;

describe("computeReminderTargets", () => {
  test("abandoners in, buyers out, one per email, latest order wins", () => {
    const targets = computeReminderTargets(
      [
        order({ email: "gone@x.co", via: "DANI", createdAt: "2026-09-01T01:00:00Z" }),
        order({ email: "gone@x.co", src: "abc123", createdAt: "2026-09-01T02:00:00Z" }),
        // Abandoned once but came back and bought: no reminder.
        order({ email: "returned@x.co" }),
        order({ email: "returned@x.co", status: "paid" }),
        // Pending is still live, not abandoned.
        order({ email: "deciding@x.co", status: "pending" }),
        // No email captured: nothing to send to.
        order({ email: null }),
      ],
      [],
    );
    assert.equal(targets.length, 1);
    assert.equal(targets[0].email, "gone@x.co");
    assert.equal(targets[0].order.src, "abc123", "the latest abandonment's attribution");
  });

  test("unsubscribed, bounced and already-reminded are excluded", () => {
    const targets = computeReminderTargets(
      [
        order({ email: "unsub@x.co" }),
        order({ email: "bounced@x.co" }),
        order({ email: "nagged@x.co", remindedAt: "2026-09-01T05:00:00Z" }),
        order({ email: "fresh@x.co" }),
      ],
      [sub("unsub@x.co", "unsubscribed"), sub("bounced@x.co", "bounced")],
    );
    assert.deepEqual(
      targets.map((t) => t.email),
      ["fresh@x.co"],
    );
  });
});

describe("one-time promo codes", () => {
  test("a code works exactly once, and only while the program matches", async () => {
    await setReminderSettings({ enabled: true, pct: 15 });
    const code = await createPromoCode("gone@x.co", 15);
    assert.match(code.id, /^[23456789abcdefghjkmnpqrstuvwxyz]{16}$/);

    assert.equal(await validatePromo(code.id), 15);
    assert.equal(await validatePromo("zzzzzzzzzzzzzzzz"), null, "unknown id");
    assert.equal(await validatePromo("junk"), null);

    // The percentage changing on the dashboard kills unspent codes.
    await setReminderSettings({ enabled: true, pct: 20 });
    assert.equal(await validatePromo(code.id), null);
    await setReminderSettings({ enabled: false, pct: 15 });
    assert.equal(await validatePromo(code.id), null, "toggle off kills it");
    await setReminderSettings({ enabled: true, pct: 15 });
    assert.equal(await validatePromo(code.id), 15, "and back on revives it");

    // Burn: once, and never twice.
    assert.equal(await markPromoUsed(code.id), true);
    assert.equal(await markPromoUsed(code.id), false, "already burned");
    assert.equal(await validatePromo(code.id), null, "burned codes are dead");
    assert.equal((await getPromoCode(code.id))?.usedAt ? true : false, true);
  });

  test("ids never collide in practice and never repeat here", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(newPromoId());
    assert.equal(seen.size, 200);
  });

  test("discount math rounds in the buyer's favour", () => {
    assert.equal(discountedUnitCents(2000, 10), 1800);
    assert.equal(discountedUnitCents(1999, 15), 1699);
    assert.equal(discountedUnitCents(100, 90), 10);
  });
});

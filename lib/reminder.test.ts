import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  computeReminderTargets,
  discountedUnitCents,
  promoToken,
  readPromoToken,
} from "./reminder.ts";
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

describe("the signed promo", () => {
  test("round trips, and an edited percentage dies", () => {
    const token = promoToken(15);
    assert.equal(readPromoToken(token), 15);
    assert.equal(readPromoToken(token.replace(/^15/, "90")), null);
    assert.equal(readPromoToken("15.aaaaaaaaaaaaaaaaaaaaaaaa"), null);
    assert.equal(readPromoToken(null), null);
    assert.equal(readPromoToken("junk"), null);
  });

  test("discount math rounds in the buyer's favour", () => {
    assert.equal(discountedUnitCents(2000, 10), 1800);
    assert.equal(discountedUnitCents(1999, 15), 1699);
    assert.equal(discountedUnitCents(100, 90), 10);
  });
});

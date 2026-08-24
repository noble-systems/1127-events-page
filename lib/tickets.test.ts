import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MAX_TICKETS_PER_ORDER,
  formatMoney,
  isSelling,
  newTicketCode,
  readQuantity,
  remainingFor,
  sellableTiers,
} from "./tickets.ts";
import type { EventRecord } from "./types.ts";

const event = (over: Partial<EventRecord> = {}): EventRecord =>
  ({
    id: "mirage",
    name: "Mirage",
    published: true,
    ticketsEnabled: true,
    ticketTiers: [
      { id: "early-bird", name: "Early Bird", priceCents: 1500, capacity: 25 },
      { id: "ga", name: "GA", priceCents: 2000, capacity: 400 },
    ],
    ...over,
  }) as EventRecord;

describe("formatMoney", () => {
  test("even dollars stay clean, cents show as cents", () => {
    assert.equal(formatMoney(1500), "$15");
    assert.equal(formatMoney(1550), "$15.50");
    assert.equal(formatMoney(2000 * 3), "$60");
    assert.equal(formatMoney(99), "$0.99");
  });
});

describe("newTicketCode", () => {
  test("readable at a door: grouped, no ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = newTicketCode();
      assert.match(code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
      assert.doesNotMatch(code, /[01OIL]/);
    }
  });

  test("does not repeat in a small sample", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => newTicketCode()));
    assert.equal(codes.size, 1000);
  });
});

describe("readQuantity", () => {
  test("whole numbers within the order cap", () => {
    assert.equal(readQuantity(1), 1);
    assert.equal(readQuantity("3"), 3);
    assert.equal(readQuantity(MAX_TICKETS_PER_ORDER), MAX_TICKETS_PER_ORDER);
  });

  test("everything else is refused, not rounded", () => {
    assert.equal(readQuantity(0), null);
    assert.equal(readQuantity(-1), null);
    assert.equal(readQuantity(2.5), null);
    assert.equal(readQuantity(MAX_TICKETS_PER_ORDER + 1), null);
    assert.equal(readQuantity("lots"), null);
    assert.equal(readQuantity(undefined), null);
  });
});

describe("what an event sells", () => {
  test("selling needs the switch, publication, and real tiers", () => {
    assert.equal(isSelling(event()), true);
    assert.equal(isSelling(event({ ticketsEnabled: false })), false);
    assert.equal(isSelling(event({ ticketsEnabled: undefined })), false);
    assert.equal(isSelling(event({ published: false })), false);
    assert.equal(isSelling(event({ ticketTiers: [] })), false);
    assert.equal(isSelling(event({ ticketTiers: undefined })), false);
  });

  test("a free or empty tier is not sellable", () => {
    const tiers = sellableTiers(
      event({
        ticketTiers: [
          { id: "a", name: "A", priceCents: 0, capacity: 10 },
          { id: "b", name: "B", priceCents: 1000, capacity: 0 },
          { id: "c", name: "C", priceCents: 1000, capacity: 10 },
        ],
      }),
    );
    assert.deepEqual(
      tiers.map((tier) => tier.id),
      ["c"],
    );
  });

  test("a hidden tier neither shows nor sells; the rest still do", () => {
    const tiers = sellableTiers(
      event({
        ticketTiers: [
          { id: "eb", name: "Early Bird", priceCents: 1500, capacity: 25, hidden: true },
          { id: "ga", name: "GA", priceCents: 2000, capacity: 100 },
        ],
      }),
    );
    assert.deepEqual(
      tiers.map((tier) => tier.id),
      ["ga"],
    );
  });
});

describe("manual sold out", () => {
  const tier = { id: "eb", name: "EB", priceCents: 1500, capacity: 25 };

  test("flag forces zero remaining regardless of the counter", () => {
    assert.equal(remainingFor(tier, 0), 25);
    assert.equal(remainingFor(tier, 20), 5);
    assert.equal(remainingFor({ ...tier, soldOut: true }, 0), 0);
  });

  test("a sold-out tier stays visible, unlike a hidden one", () => {
    const tiers = sellableTiers(
      event({
        ticketTiers: [{ ...tier, soldOut: true }],
      }),
    );
    assert.equal(tiers.length, 1, "still listed; the page greys it");
  });
});

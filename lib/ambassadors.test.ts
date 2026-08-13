import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ambassadorStats,
  isValidAmbassadorCode,
  normalizeAmbassadorCode,
  suggestAmbassadorCode,
  type Ambassador,
} from "./ambassadors.ts";
import type { TicketOrder } from "./tickets.ts";
import type { SubmissionRecord } from "./types.ts";

describe("ambassador codes", () => {
  test("normalize uppercases and trims", () => {
    assert.equal(normalizeAmbassadorCode("  dani "), "DANI");
    assert.equal(normalizeAmbassadorCode("dani-10"), "DANI-10");
  });

  test("valid codes are short, readable, hyphenable", () => {
    assert.equal(isValidAmbassadorCode("DANI"), true);
    assert.equal(isValidAmbassadorCode("DANI-10"), true);
    assert.equal(isValidAmbassadorCode("AB"), false);
    assert.equal(isValidAmbassadorCode("A".repeat(21)), false);
    assert.equal(isValidAmbassadorCode("DANI!"), false);
    assert.equal(isValidAmbassadorCode("-DANI"), false);
    assert.equal(isValidAmbassadorCode(""), false);
  });

  test("suggestions come from the first name and can decline", () => {
    assert.equal(suggestAmbassadorCode("Daniela Reyes"), "DANIELA");
    assert.equal(suggestAmbassadorCode("Jo"), "", "too short to suggest");
    assert.equal(suggestAmbassadorCode(""), "");
  });
});

describe("the payout sheet", () => {
  const amb = (code: string, active = true): Ambassador => ({
    code,
    name: code,
    active,
    createdAt: "2026-08-01T00:00:00.000Z",
  });

  const order = (via: string | undefined, status: TicketOrder["status"], quantity = 2): TicketOrder =>
    ({
      ref: Math.random().toString(36).slice(2),
      status,
      eventId: "mirage",
      tierId: "ga",
      eventName: "Mirage",
      tierName: "GA",
      quantity,
      amountCents: quantity * 2000,
      via,
      createdAt: "",
      updatedAt: "",
    }) as TicketOrder;

  const rsvp = (via?: string) => ({ via }) as SubmissionRecord;

  test("counts paid orders and RSVPs per code, nothing else", () => {
    const stats = ambassadorStats(
      [amb("DANI"), amb("MARCO")],
      [
        order("DANI", "paid", 2),
        order("DANI", "paid", 3),
        order("DANI", "pending", 8),
        order("DANI", "expired", 8),
        order("MARCO", "paid", 1),
        order(undefined, "paid", 4),
      ],
      [rsvp("DANI"), rsvp("DANI"), rsvp(), rsvp("NOBODY")],
    );

    const dani = stats.find((s) => s.code === "DANI")!;
    assert.equal(dani.orders, 2, "pending and expired money is not money");
    assert.equal(dani.tickets, 5);
    assert.equal(dani.grossCents, 5 * 2000);
    assert.equal(dani.rsvps, 2);

    const marco = stats.find((s) => s.code === "MARCO")!;
    assert.equal(marco.tickets, 1);
  });

  test("a deactivated code keeps its history", () => {
    const stats = ambassadorStats(
      [amb("GONE", false)],
      [order("GONE", "paid", 2)],
      [rsvp("GONE")],
    );
    assert.equal(stats[0].tickets, 2);
    assert.equal(stats[0].rsvps, 1);
    assert.equal(stats[0].active, false);
  });
});

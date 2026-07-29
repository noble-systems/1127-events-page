import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  APPLICATION_STATUSES,
  LIST_STATUSES,
  STATUS_LABELS,
  defaultStatusFor,
  normaliseStatus,
  statusesFor,
} from "./types.ts";

describe("statuses are scoped to the kind of submission", () => {
  test("an RSVP is a mailing list entry, not something you decline", () => {
    const rsvp = statusesFor("rsvp");
    for (const nonsense of ["reviewing", "contacted", "accepted", "declined"]) {
      assert.ok(
        !rsvp.includes(nonsense as never),
        `"${nonsense}" should not be offered for an RSVP`,
      );
    }
    assert.deepEqual([...rsvp], [...LIST_STATUSES]);
  });

  test("applications and inquiries get the review pipeline", () => {
    for (const type of ["talent", "ambassador", "partner"] as const) {
      assert.deepEqual([...statusesFor(type)], [...APPLICATION_STATUSES]);
      assert.ok(!statusesFor(type).includes("subscribed"));
    }
  });

  test("defaults match the kind", () => {
    assert.equal(defaultStatusFor("rsvp"), "subscribed");
    for (const type of ["talent", "ambassador", "partner"] as const) {
      assert.equal(defaultStatusFor(type), "new");
    }
  });

  test("every status has a label", () => {
    for (const status of [...APPLICATION_STATUSES, ...LIST_STATUSES]) {
      assert.equal(typeof STATUS_LABELS[status], "string");
      assert.ok(STATUS_LABELS[status].length > 0);
    }
  });
});

describe("normaliseStatus", () => {
  test("repairs a record carrying a status from the wrong set", () => {
    // Rows written before the split all said "new", including RSVPs.
    assert.equal(normaliseStatus("rsvp", "new"), "subscribed");
    assert.equal(normaliseStatus("rsvp", "declined"), "subscribed");
    assert.equal(normaliseStatus("talent", "subscribed"), "new");
  });

  test("leaves a valid status alone", () => {
    assert.equal(normaliseStatus("rsvp", "unsubscribed"), "unsubscribed");
    assert.equal(normaliseStatus("talent", "accepted"), "accepted");
  });

  test("handles a missing status", () => {
    assert.equal(normaliseStatus("rsvp", undefined), "subscribed");
    assert.equal(normaliseStatus("partner", undefined), "new");
  });
});

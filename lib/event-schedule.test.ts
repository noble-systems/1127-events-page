import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  eventSchedule,
  parseEventDate,
  parseEventHours,
} from "./event-schedule.ts";

// A fixed "now": August 27, 2026, noon Phoenix (19:00 UTC).
const NOW = new Date("2026-08-27T19:00:00Z");

describe("parseEventDate", () => {
  test("month day, with and without year and weekday", () => {
    assert.deepEqual(parseEventDate("Aug 30", NOW), { y: 2026, m: 8, d: 30 });
    assert.deepEqual(parseEventDate("Saturday, May 16", NOW), {
      y: 2027,
      m: 5,
      d: 16,
    });
    assert.deepEqual(parseEventDate("September 5, 2026", NOW), {
      y: 2026,
      m: 9,
      d: 5,
    });
  });

  test("a passed date without a year rolls to next year", () => {
    assert.deepEqual(parseEventDate("Jan 2", NOW), { y: 2027, m: 1, d: 2 });
    // Yesterday keeps this year: one day of grace around the event itself.
    assert.deepEqual(parseEventDate("Aug 26", NOW), { y: 2026, m: 8, d: 26 });
  });

  test("placeholders and junk return null", () => {
    assert.equal(parseEventDate("Dates Announcing Soon", NOW), null);
    assert.equal(parseEventDate("TBA", NOW), null);
    assert.equal(parseEventDate("", NOW), null);
    assert.equal(parseEventDate("sometime nice", NOW), null);
  });
});

describe("parseEventHours", () => {
  test("a range borrows the meridiem", () => {
    assert.deepEqual(parseEventHours("12-4 PM"), {
      startH: 12,
      startMin: 0,
      endH: 16,
      endNextDay: false,
    });
  });

  test("crossing midnight rolls to the next day", () => {
    assert.deepEqual(parseEventHours("9 PM - 1 AM"), {
      startH: 21,
      startMin: 0,
      endH: 1,
      endNextDay: true,
    });
  });

  test("a lone start time works; no meridiem at all does not", () => {
    assert.deepEqual(parseEventHours("7pm"), {
      startH: 19,
      startMin: 0,
      endH: null,
      endNextDay: false,
    });
    assert.equal(parseEventHours("12-4"), null);
  });
});

describe("eventSchedule", () => {
  test("date plus hours becomes Phoenix-offset ISO", () => {
    assert.deepEqual(eventSchedule("Aug 30", "12-4 PM", NOW), {
      startDate: "2026-08-30T12:00:00-07:00",
      endDate: "2026-08-30T16:00:00-07:00",
    });
  });

  test("hours over midnight end on the next calendar day", () => {
    assert.deepEqual(eventSchedule("Aug 30", "9 PM - 1 AM", NOW), {
      startDate: "2026-08-30T21:00:00-07:00",
      endDate: "2026-08-31T01:00:00-07:00",
    });
  });

  test("no readable hours falls back to a bare date; no date is null", () => {
    assert.deepEqual(eventSchedule("Aug 30", "", NOW), {
      startDate: "2026-08-30",
    });
    assert.equal(eventSchedule("Dates Announcing Soon", "12-4 PM", NOW), null);
  });
});

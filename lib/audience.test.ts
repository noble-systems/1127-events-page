import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isMailable,
  matches,
  selectAudience,
  tallyByEvent,
  tallyByGenre,
  unattributed,
} from "./audience.ts";
import { DEFAULT_GENRES } from "./genres.ts";
import type { SubmissionRecord } from "./types.ts";

function person(over: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    pk: `rsvp#${over.email ?? "a@b.co"}`,
    type: "rsvp",
    email: "a@b.co",
    name: "Alex",
    status: "subscribed",
    marketingOptIn: true,
    eventIds: ["sun-club"],
    genres: ["House"],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("isMailable", () => {
  test("needs an opt-in", () => {
    assert.equal(isMailable(person({ marketingOptIn: true })), true);
    assert.equal(isMailable(person({ marketingOptIn: false })), false);
    assert.equal(isMailable(person({ marketingOptIn: undefined })), false);
  });

  test("excludes unsubscribed and bounced even when opted in", () => {
    // Somebody who opted in and later unsubscribed must never reappear in a
    // send. This is the check that stops a segment resurrecting them.
    assert.equal(isMailable(person({ status: "unsubscribed" })), false);
    assert.equal(isMailable(person({ status: "bounced" })), false);
  });

  test("an applicant who opted in is mailable", () => {
    assert.equal(
      isMailable(person({ type: "talent", status: "new", marketingOptIn: true })),
      true,
    );
  });

  test("an applicant who did not opt in is not", () => {
    assert.equal(
      isMailable(person({ type: "talent", status: "new", marketingOptIn: false })),
      false,
    );
  });
});

describe("matches", () => {
  test("an empty segment is everybody mailable", () => {
    assert.equal(matches(person(), {}), true);
    assert.equal(matches(person({ marketingOptIn: false }), {}), false);
  });

  test("filters by event", () => {
    assert.equal(matches(person(), { eventIds: ["sun-club"] }), true);
    assert.equal(matches(person(), { eventIds: ["moon-club"] }), false);
  });

  test("filters by genre", () => {
    assert.equal(matches(person(), { genres: ["House"] }), true);
    assert.equal(matches(person(), { genres: ["Dubstep"] }), false);
  });

  test("this is the whole point: a house patron is not in a dubstep send", () => {
    const housePatron = person({ genres: ["House"], eventIds: ["sun-club"] });
    assert.equal(matches(housePatron, { genres: ["Dubstep"] }), false);
  });

  test("somebody who came to both is in both sends", () => {
    const both = person({ genres: ["House", "Dubstep"], eventIds: ["a", "b"] });
    assert.equal(matches(both, { genres: ["House"] }), true);
    assert.equal(matches(both, { genres: ["Dubstep"] }), true);
  });

  test("several genres means ANY of them, not all", () => {
    // Requiring all would produce near-empty segments and silently under-send.
    const p = person({ genres: ["House"] });
    assert.equal(matches(p, { genres: ["House", "Techno"] }), true);
  });

  test("event and genre together are ANDed", () => {
    const p = person({ eventIds: ["sun-club"], genres: ["House"] });
    assert.equal(matches(p, { eventIds: ["sun-club"], genres: ["House"] }), true);
    assert.equal(matches(p, { eventIds: ["moon-club"], genres: ["House"] }), false);
  });

  test("an unsubscribed person is excluded from every segment", () => {
    const gone = person({ status: "unsubscribed" });
    assert.equal(matches(gone, {}), false);
    assert.equal(matches(gone, { genres: ["House"] }), false);
    assert.equal(matches(gone, { eventIds: ["sun-club"] }), false);
  });

  test("mailableOnly false is for looking, and says so by including them", () => {
    const gone = person({ status: "unsubscribed" });
    assert.equal(matches(gone, { mailableOnly: false }), true);
  });

  test("somebody with no attribution matches no genre segment", () => {
    const old = person({ eventIds: [], genres: [] });
    assert.equal(matches(old, {}), true, "still on the list");
    assert.equal(matches(old, { genres: ["House"] }), false);
  });
});

describe("selectAudience", () => {
  const list = [
    person({ email: "house@x.co", genres: ["House"], eventIds: ["sun"] }),
    person({ email: "bass@x.co", genres: ["Dubstep"], eventIds: ["moon"] }),
    person({
      email: "both@x.co",
      genres: ["House", "Dubstep"],
      eventIds: ["sun", "moon"],
    }),
    person({ email: "gone@x.co", genres: ["House"], status: "unsubscribed" }),
    person({ email: "noopt@x.co", genres: ["House"], marketingOptIn: false }),
  ];

  test("a house send reaches the house people and nobody else", () => {
    const got = selectAudience(list, { genres: ["House"] }).map((r) => r.email);
    assert.deepEqual(got.sort(), ["both@x.co", "house@x.co"]);
  });

  test("a dubstep send does not reach the house-only patron", () => {
    const got = selectAudience(list, { genres: ["Dubstep"] }).map((r) => r.email);
    assert.deepEqual(got.sort(), ["bass@x.co", "both@x.co"]);
    assert.ok(!got.includes("house@x.co"));
  });

  test("unsubscribed and un-opted-in never appear", () => {
    const everyone = selectAudience(list, {}).map((r) => r.email);
    assert.ok(!everyone.includes("gone@x.co"));
    assert.ok(!everyone.includes("noopt@x.co"));
  });
});

describe("tallies", () => {
  const events = [
    { id: "sun", name: "Sun Club" },
    { id: "moon", name: "Moon Club" },
  ];
  const list = [
    person({ email: "a@x.co", eventIds: ["sun"] }),
    person({ email: "b@x.co", eventIds: ["sun"] }),
    person({ email: "c@x.co", eventIds: ["sun", "moon"] }),
    person({ email: "d@x.co", eventIds: ["moon"], status: "unsubscribed" }),
  ];

  test("counts people per event, mailable separately from total", () => {
    const tally = tallyByEvent(list, events);
    const sun = tally.find((t) => t.key === "sun");
    const moon = tally.find((t) => t.key === "moon");
    assert.equal(sun?.total, 3);
    assert.equal(sun?.mailable, 3);
    // One of moon's two unsubscribed, so the difference is visible rather than
    // hidden inside a single number.
    assert.equal(moon?.total, 2);
    assert.equal(moon?.mailable, 1);
  });

  test("sorted by size, biggest first", () => {
    const tally = tallyByEvent(list, events);
    assert.equal(tally[0]?.key, "sun");
  });

  test("genre tally omits genres nobody carries", () => {
    const tally = tallyByGenre(list, DEFAULT_GENRES);
    assert.ok(tally.every((t) => t.total > 0));
    assert.ok(tally.some((t) => t.key === "House"));
    assert.ok(!tally.some((t) => t.key === ("Polka" as string)));
  });

  test("unattributed surfaces people invisible to every genre segment", () => {
    // Everybody who signed up before attribution existed lands here. If this
    // were not surfaced the list would appear to shrink for no reason.
    const withOld = [
      ...list,
      person({ email: "old@x.co", eventIds: [], genres: [] }),
    ];
    const orphans = unattributed(withOld).map((r) => r.email);
    assert.deepEqual(orphans, ["old@x.co"]);
  });
});

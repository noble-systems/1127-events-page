import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isMailable,
  mailingList,
  matches,
  selectAudience,
  tallyByEvent,
  tallyByGenre,
  unattributed,
  canResubscribe,
  subscriptionState,
  subscriptionSummary,
  unsubscribes,
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

  test("an applicant is never mailable, even having opted in", () => {
    // The mailing list is RSVPs. Somebody who applied to DJ, or wrote in about
    // their venue, is a working contact rather than an audience for a promo.
    // Marketing to them because they filled in a form is how a business contact
    // becomes a spam complaint.
    for (const type of ["talent", "ambassador", "partner"] as const) {
      assert.equal(
        isMailable(person({ type, status: "new", marketingOptIn: true })),
        false,
        `${type} was treated as mailable`,
      );
    }
  });

  test("an RSVP that opted in still is", () => {
    assert.equal(isMailable(person({ type: "rsvp", marketingOptIn: true })), true);
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

describe("the mailing list is RSVPs only", () => {
  const mixed = [
    person({ email: "guest@x.co", type: "rsvp" }),
    person({ email: "dj@x.co", type: "talent", status: "new" }),
    person({ email: "venue@x.co", type: "partner", status: "new" }),
    person({ email: "amb@x.co", type: "ambassador", status: "new" }),
  ];

  test("mailingList keeps only RSVPs", () => {
    assert.deepEqual(
      mailingList(mixed).map((r) => r.email),
      ["guest@x.co"],
    );
  });

  test("an applicant cannot appear in any segment", () => {
    // Even unfiltered. This is the check that stops a promo reaching somebody
    // who came to us looking for work.
    for (const segment of [{}, { genres: ["House"] }, { eventIds: ["sun-club"] }]) {
      const got = selectAudience(mixed, segment).map((r) => r.email);
      assert.ok(!got.includes("dj@x.co"), JSON.stringify(segment));
      assert.ok(!got.includes("venue@x.co"), JSON.stringify(segment));
      assert.ok(!got.includes("amb@x.co"), JSON.stringify(segment));
    }
  });

  test("an applicant cannot inflate a count", () => {
    const tally = tallyByEvent(mixed, [{ id: "sun-club", name: "Sun Club" }]);
    // All four carry sun-club in the fixture, but only the RSVP is mailable.
    assert.equal(tally[0]?.mailable, 1);
  });
});

describe("unsubscribing does not remove somebody from the RSVP list", () => {
  /**
   * The regression this pins.
   *
   * The unsubscribe route deleted every row for the address. That erased the
   * RSVP history, any application they had submitted, and the record of the
   * opt-out itself. The last one is the dangerous part: with no record, the
   * next signup or import looks like fresh consent.
   */
  const gone: SubmissionRecord = {
    pk: "rsvp#sam@example.com",
    type: "rsvp",
    email: "sam@example.com",
    name: "Sam",
    status: "unsubscribed",
    marketingOptIn: false,
    unsubscribedAt: "2026-07-30T12:00:00.000Z",
    unsubscribedSource: "self",
    eventIds: ["house-night"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
  };

  const here: SubmissionRecord = {
    pk: "rsvp@example.com",
    type: "rsvp",
    email: "kit@example.com",
    name: "Kit",
    status: "subscribed",
    marketingOptIn: true,
    eventIds: ["house-night"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  test("they stay on the RSVP list", () => {
    assert.equal(mailingList([gone, here]).length, 2);
  });

  test("their event history survives", () => {
    assert.deepEqual(mailingList([gone])[0].eventIds, ["house-night"]);
  });

  test("but they are not mailable", () => {
    assert.equal(isMailable(gone), false);
    assert.equal(isMailable(here), true);
  });

  test("and they do not count towards a segment", () => {
    const picked = selectAudience([gone, here], { eventIds: ["house-night"] });
    assert.deepEqual(
      picked.map((r) => r.email),
      ["kit@example.com"],
    );
  });
});

describe("subscription state", () => {
  const make = (over: Partial<SubmissionRecord>): SubmissionRecord => ({
    pk: "rsvp#x",
    type: "rsvp",
    email: "x@example.com",
    name: "X",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  test("opted in and never opted out is subscribed", () => {
    assert.equal(
      subscriptionState(make({ marketingOptIn: true, status: "subscribed" })),
      "subscribed",
    );
  });

  test("a bounce reads as bounced, not as an unsubscribe", () => {
    // They never asked to leave. Telling the two apart is the difference
    // between a dead address and a person who opted out.
    assert.equal(subscriptionState(make({ status: "bounced" })), "bounced");
  });

  test("never opting in is not the same as unsubscribing", () => {
    const never = make({ marketingOptIn: false });
    const left = make({
      marketingOptIn: false,
      unsubscribedAt: "2026-07-30T00:00:00.000Z",
      unsubscribedSource: "admin",
    });
    // Both are "do not email", but only one is an opt-out, and only one should
    // show a date and a source on the subscriptions screen.
    assert.equal(subscriptionState(never), "unsubscribed");
    assert.equal(never.unsubscribedAt, undefined);
    assert.equal(left.unsubscribedSource, "admin");
  });

  test("the summary counts manual opt-outs separately", () => {
    const rows = [
      make({ pk: "a", marketingOptIn: true, status: "subscribed" }),
      make({ pk: "b", status: "unsubscribed", unsubscribedSource: "self" }),
      make({ pk: "c", status: "unsubscribed", unsubscribedSource: "admin" }),
      make({ pk: "d", status: "bounced" }),
      // An applicant is not on the mailing list at all.
      make({ pk: "e", type: "ambassador", marketingOptIn: true }),
    ];
    const summary = subscriptionSummary(rows);
    assert.equal(summary.rsvps, 4, "applicants must not be counted");
    assert.equal(summary.subscribed, 1);
    assert.equal(summary.unsubscribed, 2);
    assert.equal(summary.bounced, 1);
  });

  test("the log is newest first", () => {
    const rows = [
      make({ pk: "old", status: "unsubscribed", unsubscribedAt: "2026-01-01T00:00:00.000Z" }),
      make({ pk: "new", status: "unsubscribed", unsubscribedAt: "2026-07-01T00:00:00.000Z" }),
    ];
    assert.deepEqual(
      unsubscribes(rows).map((r) => r.pk),
      ["new", "old"],
    );
  });
});

describe("who may undo an opt-out", () => {
  const make = (source?: "self" | "admin" | "bounce"): SubmissionRecord => ({
    pk: "rsvp#x",
    type: "rsvp",
    email: "x@example.com",
    name: "X",
    status: "unsubscribed",
    marketingOptIn: false,
    unsubscribedAt: "2026-07-30T00:00:00.000Z",
    unsubscribedSource: source,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  });

  test("an admin cannot undo somebody's own unsubscribe", () => {
    // They made a decision about their own inbox. A dashboard button that
    // quietly reverses it is how a domain gets reported.
    assert.equal(canResubscribe(make("self")), false);
  });

  test("an admin can undo their own", () => {
    // Correcting a mistake, not overriding anybody.
    assert.equal(canResubscribe(make("admin")), true);
  });

  test("a bounce can be cleared", () => {
    // A dead address is a fact, not a decision by a person.
    assert.equal(canResubscribe(make("bounce")), true);
  });

  test("a record with no source is not treated as theirs", () => {
    // Rows predating the source field. Locking them would strand people with no
    // way back, and there is no evidence they asked to leave themselves.
    assert.equal(canResubscribe(make(undefined)), true);
  });
});

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, test } from "node:test";

/**
 * These run against the local JSON driver, which keys off `process.cwd()` at
 * import time. The chdir has to happen before the import below, so the import
 * is dynamic and the order here is load-bearing.
 */
process.chdir(mkdtempSync(path.join(tmpdir(), "1127-store-")));

const {
  createEvent,
  featuredEvent,
  listAllEvents,
  recordSubmission,
  store,
  suppressEmail,
  updateEvent,
} = await import("./index.ts");

const EVENT = {
  name: "",
  tagline: "A tagline.",
  summary: "A summary.",
  status: "Announcing Soon",
  date: "Dates Announcing Soon",
  location: "Old Town Scottsdale, Arizona",
  venue: null,
  tags: [],
  genres: [],
  tone: "dusk" as const,
  featured: false,
  published: true,
  rsvpEnabled: true,
  order: 0,
  shotNote: "",
  image: null,
  imageAlt: "",
  ctaLabel: "RSVP",
  ctaAction: "rsvp" as const,
  emailSubject: null,
  emailHeading: null,
  emailBody: null,
};

const event = (id: string, over: Partial<typeof EVENT> = {}) => ({
  ...EVENT,
  id,
  name: id,
  ...over,
});

/** The local driver has no truncate, so clear both tables by hand. */
async function reset() {
  const s = store();
  for (const row of await s.listEvents()) await s.deleteEvent(row.id);
  for (const row of await s.listSubmissions()) await s.deleteSubmission(row.pk);
}

describe("featured is a single slot", () => {
  beforeEach(reset);

  test("featuring one event unfeatures the others", async () => {
    await createEvent(event("sun-club", { featured: true, order: 0 }));
    await createEvent(event("desert-sessions", { featured: false, order: 1 }));

    const desert = (await listAllEvents()).find((e) => e.id === "desert-sessions")!;
    await updateEvent(desert, event("desert-sessions", { featured: true, order: 1 }));

    const featured = (await listAllEvents()).filter((e) => e.featured);
    assert.deepEqual(
      featured.map((e) => e.id),
      ["desert-sessions"],
      "exactly one event should be featured",
    );
  });

  test("creating a featured event also demotes the incumbent", async () => {
    await createEvent(event("sun-club", { featured: true }));
    await createEvent(event("rooftop", { featured: true, order: 1 }));

    const featured = (await listAllEvents()).filter((e) => e.featured);
    assert.equal(featured.length, 1);
    assert.equal(featured[0].id, "rooftop");
  });

  test("saving an unfeatured event leaves the featured one alone", async () => {
    await createEvent(event("sun-club", { featured: true }));
    await createEvent(event("rooftop", { featured: false, order: 1 }));

    const rooftop = (await listAllEvents()).find((e) => e.id === "rooftop")!;
    await updateEvent(rooftop, event("rooftop", { featured: false, order: 1 }));

    assert.equal((await featuredEvent())?.id, "sun-club");
  });
});

describe("featuredEvent", () => {
  beforeEach(reset);

  /**
   * The regression this pins.
   *
   * Call sites used to end in `?? events[0]`, so unticking Featured changed
   * nothing on screen: the first event by display order silently took over.
   * Sun Club sorts first, which is why it looked permanently featured.
   */
  test("returns null when nothing is featured, rather than the first event", async () => {
    await createEvent(event("sun-club", { featured: false, order: 0 }));
    await createEvent(event("rooftop", { featured: false, order: 1 }));

    assert.equal(await featuredEvent(), null);
  });

  test("never returns an unpublished event", async () => {
    await createEvent(event("draft", { featured: true, published: false }));
    assert.equal(await featuredEvent(), null);
  });

  test("returns the featured event when there is one", async () => {
    await createEvent(event("sun-club", { featured: false, order: 0 }));
    await createEvent(event("rooftop", { featured: true, order: 1 }));

    assert.equal((await featuredEvent())?.id, "rooftop");
  });
});

describe("recordSubmission reports what changed", () => {
  beforeEach(reset);

  /** The shape the form posts: everything is a string. */
  const rsvp = (eventId = "") => ({
    name: "Sam",
    email: "sam@example.com",
    marketingOptIn: "true",
    eventId,
  });

  test("a first signup is new", async () => {
    const out = await recordSubmission("rsvp", rsvp());
    assert.equal(out.isNew, true);
    assert.equal(out.isNewEvent, false, "no event was attached");
  });

  /**
   * The bug this pins.
   *
   * The route used to infer "first time" from `createdAt === updatedAt`, and
   * RSVPs dedupe by email, so somebody who signed up for a second event had
   * their record updated and got no confirmation at all.
   */
  test("the same person signing up for a second event is a new event", async () => {
    await createEvent(event("house-night", { featured: true }));
    await createEvent(event("bass-night", { order: 1 }));

    const first = await recordSubmission("rsvp", rsvp("house-night"));
    assert.equal(first.isNew, true);
    assert.equal(first.isNewEvent, true);

    const second = await recordSubmission("rsvp", rsvp("bass-night"));
    assert.equal(second.isNew, false, "the person already existed");
    assert.equal(second.isNewEvent, true, "but this event is new to them");
    assert.deepEqual(second.record.eventIds, ["house-night", "bass-night"]);
  });

  test("a true duplicate is neither", async () => {
    await createEvent(event("house-night"));

    await recordSubmission("rsvp", rsvp("house-night"));
    const again = await recordSubmission("rsvp", rsvp("house-night"));

    assert.equal(again.isNew, false);
    assert.equal(again.isNewEvent, false);
    assert.deepEqual(again.record.eventIds, ["house-night"]);
  });

  test("one person, not two records, across both events", async () => {
    await createEvent(event("house-night"));
    await createEvent(event("bass-night", { order: 1 }));

    await recordSubmission("rsvp", rsvp("house-night"));
    await recordSubmission("rsvp", rsvp("bass-night"));

    const rows = (await store().listSubmissions()).filter(
      (row) => row.type === "rsvp",
    );
    assert.equal(rows.length, 1);
  });
});

describe("unsubscribing suppresses rather than deletes", () => {
  beforeEach(reset);

  const values = (over: Record<string, string> = {}) => ({
    name: "Sam",
    email: "sam@example.com",
    marketingOptIn: "true",
    eventId: "",
    ...over,
  });

  test("the RSVP row survives, with its event history", async () => {
    await createEvent(event("house-night"));
    await recordSubmission("rsvp", values({ eventId: "house-night" }));

    const touched = await suppressEmail("sam@example.com", "self");
    assert.equal(touched, 1);

    const rows = await store().listSubmissions();
    assert.equal(rows.length, 1, "the row was deleted");
    assert.equal(rows[0].status, "unsubscribed");
    assert.equal(rows[0].marketingOptIn, false);
    assert.equal(rows[0].unsubscribedSource, "self");
    assert.ok(rows[0].unsubscribedAt, "no timestamp recorded");
    assert.deepEqual(rows[0].eventIds, ["house-night"], "history was lost");
  });

  test("an application by the same person is suppressed, not destroyed", async () => {
    await recordSubmission("rsvp", values());
    await recordSubmission("ambassador", values({ community: "Hospitality" }));

    await suppressEmail("sam@example.com", "self");

    const rows = await store().listSubmissions();
    assert.equal(rows.length, 2, "an application was deleted");

    const application = rows.find((r) => r.type === "ambassador")!;
    // Its status is a review pipeline; "unsubscribed" is not a stage in it.
    assert.notEqual(application.status, "unsubscribed");
    assert.equal(application.marketingOptIn, false, "still mailable");
    assert.ok(application.unsubscribedAt);
  });

  test("matching is case-insensitive, since addresses are stored folded", async () => {
    await recordSubmission("rsvp", values());
    assert.equal(await suppressEmail("SAM@Example.COM", "self"), 1);
  });

  test("an address with no records is a no-op, not an error", async () => {
    assert.equal(await suppressEmail("nobody@example.com", "self"), 0);
  });
});

describe("a past opt-out outlives a later signup", () => {
  beforeEach(reset);

  const values = {
    name: "Sam",
    email: "sam@example.com",
    marketingOptIn: "true",
    eventId: "house-night",
  };

  /**
   * The regression this pins.
   *
   * The record is rebuilt from scratch on every signup, so ticking the
   * marketing box again set marketingOptIn back to true on somebody who had
   * unsubscribed, and the timestamp and source were not carried at all. A
   * re-signup silently erased the record of the opt-out and left a row claiming
   * to be opted in and opted out at once.
   */
  test("signing up again does not quietly re-subscribe them", async () => {
    await createEvent(event("house-night"));
    await recordSubmission("rsvp", values);
    await suppressEmail("sam@example.com", "self");
    await recordSubmission("rsvp", values);

    const row = (await store().listSubmissions())[0];
    assert.equal(row.status, "unsubscribed");
    assert.equal(row.marketingOptIn, false, "quietly opted back in");
  });

  test("the record of the opt-out survives", async () => {
    await createEvent(event("house-night"));
    await recordSubmission("rsvp", values);
    await suppressEmail("sam@example.com", "self");
    const before = (await store().listSubmissions())[0].unsubscribedAt;

    await recordSubmission("rsvp", values);
    const row = (await store().listSubmissions())[0];

    assert.equal(row.unsubscribedAt, before, "timestamp was rewritten or lost");
    assert.equal(row.unsubscribedSource, "self", "source was lost");
  });

  test("the new event is still recorded against them", async () => {
    // Suppression is about email, not about attendance. They still came.
    await createEvent(event("house-night"));
    await createEvent(event("bass-night", { order: 1 }));
    await recordSubmission("rsvp", values);
    await suppressEmail("sam@example.com", "self");
    await recordSubmission("rsvp", { ...values, eventId: "bass-night" });

    assert.deepEqual((await store().listSubmissions())[0].eventIds, [
      "house-night",
      "bass-night",
    ]);
  });
});

describe("RSVPing twice for the same event", () => {
  beforeEach(reset);

  test("makes one record, not two, and does not duplicate the event", async () => {
    await createEvent(event("house-night"));
    const v = {
      name: "Sam",
      email: "sam@example.com",
      marketingOptIn: "true",
      eventId: "house-night",
    };
    for (let i = 0; i < 3; i++) await recordSubmission("rsvp", v);

    const rows = await store().listSubmissions();
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].eventIds, ["house-night"]);
  });
});

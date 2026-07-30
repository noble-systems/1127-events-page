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

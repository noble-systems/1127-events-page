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

const { isMailable, isSuppressed, subscriptionState } = await import(
  "../audience.ts"
);

const {
  createEvent,
  deleteEvent,
  listPublicEvents,
  listAllEvents,
  recordSubmission,
  store,
  setFeaturedEvent,
  suppressEmail,
  updateEvent,
  updateSubmissionMeta,
} = await import("./index.ts");

const EVENT = {
  name: "",
  tagline: "A tagline.",
  summary: "A summary.",
  heroBody: "",
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

/**
 * The local driver has no truncate, so clear both tables by hand.
 *
 * The marker row is written back deliberately. loadEvents() re-imports the
 * launch content whenever the events table is empty and unmarked, so a test
 * that cleared everything got Sun Club and the rest handed back on its first
 * read, and then asserted against seed data it never created.
 */
async function reset() {
  const s = store();
  for (const row of await s.listEvents()) await s.deleteEvent(row.id);
  for (const row of await s.listSubmissions()) await s.deleteSubmission(row.pk);

  await s.putEvent({
    ...event("__seed__"),
    name: "seed marker",
    published: false,
    order: 999,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
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

    const featured = (await listAllEvents()).find((e) => e.featured);
    assert.equal(featured?.id, "sun-club");
  });
});

describe("what the public site sees as featured", () => {
  beforeEach(reset);

  /**
   * The regression this pins.
   *
   * Call sites used to read `events.find(featured) ?? events[0]`, so unticking
   * Featured changed nothing on screen: the first event by display order
   * silently took over, and Sun Club sorts first, which made it look
   * permanently featured. Nothing featured must mean nothing featured.
   */
  const publicFeatured = async () =>
    (await listPublicEvents()).find((event) => event.featured) ?? null;

  test("nothing featured means nothing featured", async () => {
    await createEvent(event("sun-club", { featured: false, order: 0 }));
    await createEvent(event("rooftop", { featured: false, order: 1 }));
    assert.equal(await publicFeatured(), null);
  });

  test("a featured draft is invisible to the public", async () => {
    await createEvent(event("draft", { featured: true, published: false }));
    assert.equal(await publicFeatured(), null);
  });

  test("the featured event is found when there is one", async () => {
    await createEvent(event("sun-club", { featured: false, order: 0 }));
    await createEvent(event("rooftop", { featured: true, order: 1 }));
    assert.equal((await publicFeatured())?.id, "rooftop");
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

describe("resubscribing actually puts somebody back", () => {
  beforeEach(reset);

  const values = {
    name: "Sam",
    email: "sam@example.com",
    marketingOptIn: "true",
    eventId: "",
  };

  /**
   * The regression this pins.
   *
   * Suppressing clears marketingOptIn, which is what isMailable reads. Undoing
   * it only changed the status, so the row read "subscribed" on the People and
   * Subscriptions screens while being absent from the mailable audience and
   * from every export. Two screens, two answers, no error.
   */
  test("they are mailable again, not just labelled subscribed", async () => {
    await recordSubmission("rsvp", values);
    const pk = (await store().listSubmissions())[0].pk;

    await updateSubmissionMeta(pk, { status: "unsubscribed" });
    assert.equal(isMailable((await store().listSubmissions())[0]), false);

    await updateSubmissionMeta(pk, { status: "subscribed" });
    const back = (await store().listSubmissions())[0];
    assert.equal(back.marketingOptIn, true, "the flag isMailable reads");
    assert.equal(isMailable(back), true);
    assert.equal(subscriptionState(back), "subscribed");
  });

  test("the earlier opt-out is kept as history, not erased", async () => {
    await recordSubmission("rsvp", values);
    const pk = (await store().listSubmissions())[0].pk;
    await updateSubmissionMeta(pk, { status: "unsubscribed" });
    await updateSubmissionMeta(pk, { status: "subscribed" });

    const row = (await store().listSubmissions())[0];
    assert.ok(row.unsubscribedAt, "history was thrown away");
    assert.ok(row.resubscribedAt, "no record of coming back");
    // Kept, but no longer current: that distinction is the whole fix.
    assert.equal(isSuppressed(row), false);
  });

  test("a signup after a resubscribe does not re-suppress them", async () => {
    // recordSubmission asks whether the address is suppressed before deciding
    // what to do with the opt-in box. Reading unsubscribedAt on its own put
    // them straight back in the hole.
    await recordSubmission("rsvp", values);
    const pk = (await store().listSubmissions())[0].pk;
    await updateSubmissionMeta(pk, { status: "unsubscribed" });
    await updateSubmissionMeta(pk, { status: "subscribed" });

    await recordSubmission("rsvp", values);
    assert.equal(isMailable((await store().listSubmissions())[0]), true);
  });
});

describe("featured moves on when the event does", () => {
  beforeEach(reset);

  /** Display order decides who is next, since that is the page's own order. */
  const three = async () => {
    await createEvent(event("first", { featured: true, order: 0 }));
    await createEvent(event("second", { order: 1 }));
    await createEvent(event("third", { order: 2 }));
  };

  const featuredId = async () =>
    (await listAllEvents()).find((e) => e.featured)?.id ?? null;

  test("unpublishing the featured event promotes the next one", async () => {
    // Otherwise the site is left with no hero and /rsvp pointing nowhere,
    // because somebody hid a draft.
    await three();
    const first = (await listAllEvents()).find((e) => e.id === "first")!;
    await updateEvent(first, event("first", { featured: true, published: false, order: 0 }));

    assert.equal(await featuredId(), "second");
  });

  test("the unpublished event does not keep the slot", async () => {
    await three();
    const first = (await listAllEvents()).find((e) => e.id === "first")!;
    await updateEvent(first, event("first", { featured: true, published: false, order: 0 }));

    const back = (await listAllEvents()).find((e) => e.id === "first")!;
    assert.equal(back.featured, false, "a draft cannot be the featured event");
  });

  test("deleting the featured event promotes the next one", async () => {
    await three();
    await deleteEvent("first");
    assert.equal(await featuredId(), "second");
  });

  test("it skips drafts when promoting", async () => {
    await createEvent(event("first", { featured: true, order: 0 }));
    await createEvent(event("draft", { published: false, order: 1 }));
    await createEvent(event("live", { order: 2 }));

    await deleteEvent("first");
    assert.equal(await featuredId(), "live");
  });

  test("with nothing left to promote, nothing is featured", async () => {
    await createEvent(event("only", { featured: true }));
    await deleteEvent("only");
    assert.equal(await featuredId(), null);
  });

  test("unpublishing an event that was not featured changes nothing", async () => {
    await three();
    const third = (await listAllEvents()).find((e) => e.id === "third")!;
    await updateEvent(third, event("third", { published: false, order: 2 }));
    assert.equal(await featuredId(), "first");
  });
});

describe("a draft cannot take the slot on create", () => {
  beforeEach(reset);

  /**
   * The regression this pins. updateEvent enforced published-only, createEvent
   * did not, so POSTing a featured draft stripped Featured from the live event
   * and left the site with nothing featured at all.
   */
  test("creating a featured draft neither keeps nor steals Featured", async () => {
    await createEvent(event("live", { featured: true, order: 0 }));
    await createEvent(event("sneaky", { featured: true, published: false, order: 1 }));

    const rows = await listAllEvents();
    assert.equal(rows.find((e) => e.id === "sneaky")?.featured, false);
    assert.equal(rows.find((e) => e.id === "live")?.featured, true, "the slot was stolen");
  });
});

describe("featured is chosen from the list", () => {
  beforeEach(reset);

  test("choosing one takes it from the other", async () => {
    await createEvent(event("a", { featured: true, order: 0 }));
    await createEvent(event("b", { order: 1 }));

    await setFeaturedEvent("b");
    const featured = (await listAllEvents()).filter((e) => e.featured);
    assert.deepEqual(featured.map((e) => e.id), ["b"]);
  });

  test("it can be cleared", async () => {
    await createEvent(event("a", { featured: true }));
    await setFeaturedEvent(null);
    assert.equal((await listAllEvents()).filter((e) => e.featured).length, 0);
  });

  test("a draft cannot be featured", async () => {
    // The list must not be able to create the state that unpublishing exists to
    // prevent.
    await createEvent(event("live", { featured: true, order: 0 }));
    await createEvent(event("draft", { published: false, order: 1 }));

    await setFeaturedEvent("draft");
    assert.equal(
      (await listAllEvents()).find((e) => e.featured)?.id,
      "live",
      "a draft took the slot",
    );
  });

  test("an id that does not exist is a no-op", async () => {
    await createEvent(event("a", { featured: true }));
    await setFeaturedEvent("nope");
    assert.equal((await listAllEvents()).find((e) => e.featured)?.id, "a");
  });
});

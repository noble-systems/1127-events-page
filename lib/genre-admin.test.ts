import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describePlan, planChange, validateGenreName } from "./genre-admin.ts";

const CURRENT = ["House", "Bass", "Dubstep"];

const EVENTS = [
  { id: "sun", genres: ["House"] },
  { id: "moon", genres: ["Bass", "Dubstep"] },
  { id: "quiet", genres: [] },
];

const PEOPLE = [
  { pk: "rsvp#a", genres: ["House"] },
  { pk: "rsvp#b", genres: ["Bass", "Dubstep"] },
  { pk: "rsvp#c", genres: ["House", "Bass"] },
  { pk: "rsvp#d", genres: [] },
];

describe("validateGenreName", () => {
  test("accepts realistic genre names", () => {
    for (const name of [
      "House",
      "Drum & Bass",
      "Hip Hop / R&B",
      "90s",
      "Afro-House",
    ]) {
      assert.equal(validateGenreName(name, []), null, `rejected "${name}"`);
    }
  });

  test("rejects empty and overlong", () => {
    assert.ok(validateGenreName("", []));
    assert.ok(validateGenreName("   ", []));
    assert.ok(validateGenreName("x".repeat(41), []));
  });

  test("rejects characters that would need escaping downstream", () => {
    // These end up in CSV cells and URL query parameters. Excluding them here
    // means neither place needs special handling.
    for (const name of ['House"', "House,Bass", "<b>House</b>", "House\nBass"]) {
      assert.ok(validateGenreName(name, []), `accepted "${name}"`);
    }
  });

  test("rejects a duplicate regardless of case", () => {
    // "house" and "House" would look like one genre in the list and behave as
    // two everywhere else.
    assert.ok(validateGenreName("house", CURRENT));
    assert.ok(validateGenreName("HOUSE", CURRENT));
    assert.ok(validateGenreName("  House  ", CURRENT));
  });
});

describe("add", () => {
  test("appends and touches nothing else", () => {
    const plan = planChange(
      CURRENT,
      { kind: "add", name: "Techno" },
      EVENTS,
      PEOPLE,
    );
    assert.deepEqual(plan.genres, ["House", "Bass", "Dubstep", "Techno"]);
    assert.deepEqual(plan.events, []);
    assert.deepEqual(plan.people, []);
    assert.equal(plan.error, undefined);
  });

  test("refuses a duplicate", () => {
    const plan = planChange(
      CURRENT,
      { kind: "add", name: "house" },
      EVENTS,
      PEOPLE,
    );
    assert.ok(plan.error);
    assert.deepEqual(plan.genres, CURRENT, "list unchanged on error");
  });
});

describe("rename", () => {
  test("migrates every event and person carrying the old value", () => {
    // The whole reason rename is not just a list edit. Without this, every
    // house patron keeps a genre that matches no segment and silently stops
    // receiving anything.
    const plan = planChange(
      CURRENT,
      { kind: "rename", from: "House", to: "Deep House" },
      EVENTS,
      PEOPLE,
    );
    assert.deepEqual(plan.genres, ["Deep House", "Bass", "Dubstep"]);
    assert.deepEqual(plan.events, [{ id: "sun", genres: ["Deep House"] }]);
    assert.deepEqual(plan.people, [
      { pk: "rsvp#a", genres: ["Deep House"] },
      { pk: "rsvp#c", genres: ["Deep House", "Bass"] },
    ]);
  });

  test("leaves records that never had it alone", () => {
    const plan = planChange(
      CURRENT,
      { kind: "rename", from: "House", to: "Deep House" },
      EVENTS,
      PEOPLE,
    );
    assert.ok(!plan.events.some((e) => e.id === "moon"));
    assert.ok(!plan.people.some((p) => p.pk === "rsvp#b"));
  });

  test("allows fixing capitalisation of the same genre", () => {
    const plan = planChange(
      CURRENT,
      { kind: "rename", from: "House", to: "HOUSE" },
      EVENTS,
      PEOPLE,
    );
    assert.equal(plan.error, undefined);
    assert.deepEqual(plan.genres, ["HOUSE", "Bass", "Dubstep"]);
  });

  test("refuses renaming onto another existing genre, which would merge audiences", () => {
    const plan = planChange(
      CURRENT,
      { kind: "rename", from: "House", to: "Bass" },
      EVENTS,
      PEOPLE,
    );
    assert.ok(plan.error);
  });

  test("refuses renaming something not in the list", () => {
    const plan = planChange(
      CURRENT,
      { kind: "rename", from: "Polka", to: "Techno" },
      EVENTS,
      PEOPLE,
    );
    assert.ok(plan.error);
  });
});

describe("delete", () => {
  test("strips the genre from every event and person", () => {
    const plan = planChange(
      CURRENT,
      { kind: "delete", name: "House" },
      EVENTS,
      PEOPLE,
    );
    assert.deepEqual(plan.genres, ["Bass", "Dubstep"]);
    assert.deepEqual(plan.events, [{ id: "sun", genres: [] }]);
    assert.deepEqual(plan.people, [
      { pk: "rsvp#a", genres: [] },
      { pk: "rsvp#c", genres: ["Bass"] },
    ]);
  });

  test("leaves a person's other genres intact", () => {
    const plan = planChange(
      CURRENT,
      { kind: "delete", name: "House" },
      EVENTS,
      PEOPLE,
    );
    const c = plan.people.find((p) => p.pk === "rsvp#c");
    assert.deepEqual(c?.genres, ["Bass"], "Bass must survive");
  });
});

describe("describePlan", () => {
  test("states the blast radius before anyone commits", () => {
    const plan = planChange(
      CURRENT,
      { kind: "rename", from: "House", to: "Deep House" },
      EVENTS,
      PEOPLE,
    );
    assert.equal(describePlan(plan), "1 event and 2 people");
  });

  test("says so when nothing else is affected", () => {
    const plan = planChange(
      CURRENT,
      { kind: "add", name: "Techno" },
      EVENTS,
      PEOPLE,
    );
    assert.equal(describePlan(plan), "nothing else");
  });

  test("gets singular and plural right", () => {
    const one = planChange(
      ["House"],
      { kind: "delete", name: "House" },
      [{ id: "sun", genres: ["House"] }],
      [{ pk: "rsvp#a", genres: ["House"] }],
    );
    assert.equal(describePlan(one), "1 event and 1 person");
  });
});

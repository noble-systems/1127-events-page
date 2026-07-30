import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EMPTY_EVENT,
  eventToFormValues,
  readEventBody,
  slugify,
  toEventInput,
  validateEvent,
  type EventFormValues,
} from "./event-input.ts";
import { DEFAULT_GENRES } from "./genres.ts";

/**
 * The genre list is data now, so these mappers take it explicitly rather than
 * defaulting. That default was a bug: it silently discarded any genre an admin
 * had created.
 */
const GENRE_LIST = DEFAULT_GENRES;

const valid: EventFormValues = {
  ...EMPTY_EVENT,
  name: "Desert Sessions",
  tagline: "Rooftop house after dark.",
  summary: "An after-dark rooftop counterpart to Sun Club.",
  imageAlt: "Guests on a rooftop at night",
  ctaLabel: "RSVP",
  tags: "House music, Rooftop, After dark",
};

describe("slugify", () => {
  test("produces url-safe keys", () => {
    assert.equal(slugify("Sun Club"), "sun-club");
    assert.equal(slugify("  Desert   Sessions  "), "desert-sessions");
    assert.equal(slugify("Café & Bar!"), "cafe-bar");
    assert.equal(slugify("A_B"), "a-b");
  });

  test("never returns an empty key", () => {
    assert.equal(slugify(""), "event");
    assert.equal(slugify("!!!"), "event");
  });

  test("caps length", () => {
    assert.ok(slugify("x".repeat(200)).length <= 60);
  });
});

describe("validateEvent", () => {
  test("accepts a complete event", () => {
    assert.deepEqual(validateEvent(valid), {});
  });

  test("requires the fields the card renders", () => {
    const errors = validateEvent({ ...EMPTY_EVENT, name: "", tagline: "" });
    for (const field of ["name", "tagline", "summary", "imageAlt"]) {
      assert.ok(errors[field], `expected ${field} to be required`);
    }
  });

  test("only allows known palettes and CTA targets", () => {
    assert.ok(validateEvent({ ...valid, tone: "neon" }).tone);
    assert.equal(validateEvent({ ...valid, tone: "cobalt" }).tone, undefined);
    assert.ok(validateEvent({ ...valid, ctaAction: "javascript" }).ctaAction);
    assert.equal(
      validateEvent({ ...valid, ctaAction: "partner" }).ctaAction,
      undefined,
    );
  });

  test("rejects remote and traversing image paths", () => {
    for (const image of [
      "https://evil.example/x.jpg",
      "//evil.example/x.jpg",
      "media/no-leading-slash.jpg",
      "javascript:alert(1)",
      "/media/../../etc/passwd",
      "/media/..%2Fsecret.jpg",
    ]) {
      assert.ok(
        validateEvent({ ...valid, image }).image,
        `expected "${image}" to be rejected`,
      );
    }
    assert.equal(
      validateEvent({ ...valid, image: "/media/sun-club-01.jpg" }).image,
      undefined,
    );
  });

  test("bounds the display order", () => {
    assert.ok(validateEvent({ ...valid, order: "-1" }).order);
    assert.ok(validateEvent({ ...valid, order: "1000" }).order);
    assert.ok(validateEvent({ ...valid, order: "abc" }).order);
    assert.equal(validateEvent({ ...valid, order: "0" }).order, undefined);
  });
});

describe("toEventInput", () => {
  test("splits, trims and caps tags", () => {
    const input = toEventInput(
      "desert-sessions",
      {
        ...valid,
        tags: " a , b ,, c ,d,e,f,g,h,i,j ",
      },
      GENRE_LIST,
    );
    assert.deepEqual(input.tags.slice(0, 3), ["a", "b", "c"]);
    assert.ok(input.tags.length <= 8);
    assert.ok(!input.tags.includes(""));
  });

  test("turns blank venue and image into null", () => {
    const input = toEventInput(
      "x",
      { ...valid, venue: "  ", image: "" },
      GENRE_LIST,
    );
    assert.equal(input.venue, null);
    assert.equal(input.image, null);
  });

  test("coerces order to a number", () => {
    assert.equal(toEventInput("x", { ...valid, order: "7" }, GENRE_LIST).order, 7);
  });
});

describe("readEventBody", () => {
  test("normalises a JSON body with mixed types", () => {
    const values = readEventBody(
      {
        name: "X",
        tags: ["a", "b"],
        order: 3,
        featured: true,
        published: "true",
      },
      GENRE_LIST,
    );
    assert.equal(values.tags, "a, b");
    assert.equal(values.order, "3");
    assert.equal(values.featured, true);
    assert.equal(values.published, true);
  });

  test("survives junk input without throwing", () => {
    for (const body of [null, undefined, 42, "string", []]) {
      const values = readEventBody(body, GENRE_LIST);
      assert.equal(typeof values.name, "string");
      assert.equal(values.series, "1127 Events");
    }
  });

  test("does not treat arbitrary truthy values as booleans", () => {
    const values = readEventBody({ published: "yes", featured: 1 }, GENRE_LIST);
    assert.equal(values.published, false);
    assert.equal(values.featured, false);
  });
});

describe("a genre an admin created survives a save", () => {
  /**
   * The regression this pins.
   *
   * normaliseGenres used to default to the seed list, so an event saved with
   * ["House", "Rave"] came back as ["House"]. Nothing errored: the custom genre
   * was simply gone, which looked like "multiple genres are not allowed".
   */
  const LIVE = [...DEFAULT_GENRES, "Rave", "Afro House"];

  test("keeps every selected genre, custom ones included", () => {
    const values = readEventBody(
      { ...valid, genres: ["House", "Rave", "Afro House"] },
      LIVE,
    );
    assert.deepEqual(values.genres, ["House", "Rave", "Afro House"]);
  });

  test("survives the whole round trip", () => {
    const values = readEventBody({ ...valid, genres: ["House", "Rave"] }, LIVE);
    const input = toEventInput("x", values, LIVE);
    assert.deepEqual(input.genres, ["House", "Rave"]);
    const back = eventToFormValues(input, LIVE);
    assert.deepEqual(back.genres, ["House", "Rave"]);
  });

  test("a genre that is genuinely not in the list is still dropped", () => {
    // The filtering is still doing its job; it just uses the right list now.
    const values = readEventBody({ ...valid, genres: ["House", "Polka"] }, LIVE);
    assert.deepEqual(values.genres, ["House"]);
  });

  test("many genres at once all persist", () => {
    const many = ["House", "Techno", "Bass", "Dubstep", "Rave"];
    const values = readEventBody({ ...valid, genres: many }, LIVE);
    assert.equal(values.genres.length, 5, JSON.stringify(values.genres));
  });
});

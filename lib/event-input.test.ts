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
    for (const field of ["name", "tagline", "summary"]) {
      assert.ok(errors[field], `expected ${field} to be required`);
    }
  });

  test("does not require alt text", () => {
    // Most events are created before there is a photograph to describe, and
    // blocking the save on alt text meant the event could not be drafted at all.
    assert.equal(validateEvent({ ...valid, imageAlt: "" }).imageAlt, undefined);
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

describe("accepting RSVPs is separate from being published", () => {
  /**
   * An event can be worth showing on the site long before there is anything to
   * sign up for. "More concepts in development" is the case that forced this:
   * it belongs on the page, but a signup form for it collects addresses against
   * a night that does not exist.
   */
  test("new events start open to RSVPs", () => {
    assert.equal(EMPTY_EVENT.rsvpEnabled, true);
  });

  test("an absent flag means open, not closed", () => {
    // A payload written before this field existed must keep collecting signups
    // rather than silently stopping.
    assert.equal(readEventBody({ name: "X" }, GENRE_LIST).rsvpEnabled, true);
  });

  test("it can be turned off, and survives the round trip", () => {
    const values = readEventBody({ ...valid, rsvpEnabled: false }, GENRE_LIST);
    assert.equal(values.rsvpEnabled, false);

    const input = toEventInput("x", values, GENRE_LIST);
    assert.equal(input.rsvpEnabled, false);
    assert.equal(eventToFormValues(input, GENRE_LIST).rsvpEnabled, false);
  });

  test("it does not follow published", () => {
    const values = readEventBody(
      { ...valid, published: true, rsvpEnabled: false },
      GENRE_LIST,
    );
    assert.equal(values.published, true);
    assert.equal(values.rsvpEnabled, false);
  });

  test("only a real false turns it off", () => {
    for (const raw of ["no", 0, null, "false"]) {
      const values = readEventBody({ ...valid, rsvpEnabled: raw }, GENRE_LIST);
      assert.equal(
        values.rsvpEnabled,
        raw === "false" ? false : true,
        `rsvpEnabled: ${JSON.stringify(raw)}`,
      );
    }
  });
});

describe("the hero paragraph belongs to the event", () => {
  /**
   * Everything else in the hero already came from the featured event: the name,
   * the tagline, the date, the photograph. The paragraph came from site
   * content, so the block described one specific night in four fields and the
   * series in general in the fifth.
   */
  test("it round-trips through the form", () => {
    const values = readEventBody(
      { ...valid, heroBody: "  One night at the pool.  " },
      GENRE_LIST,
    );
    const input = toEventInput("x", values, GENRE_LIST);
    assert.equal(input.heroBody, "One night at the pool.");
    assert.equal(eventToFormValues(input, GENRE_LIST).heroBody, "One night at the pool.");
  });

  test("it is optional", () => {
    // Blank means "use the standard line", which is what shows when no event is
    // featured at all. Requiring it would block drafting an event.
    assert.equal(validateEvent({ ...valid, heroBody: "" }).heroBody, undefined);
    assert.equal(toEventInput("x", { ...valid, heroBody: "   " }, GENRE_LIST).heroBody, "");
  });

  test("a record written before the field existed does not break", () => {
    // eventToFormValues reads it off stored events, and older rows have no such
    // property at all.
    const { heroBody, ...older } = toEventInput("x", valid, GENRE_LIST);
    assert.equal(typeof heroBody, "string");
    assert.equal(
      eventToFormValues(older as Parameters<typeof eventToFormValues>[0], GENRE_LIST)
        .heroBody,
      "",
    );
  });
});

describe("the hero logo belongs to the event", () => {
  /**
   * A wordmark shown in place of the typed name while the event is featured.
   * Optional, validated exactly like the photograph, and it must survive the
   * whole-event round trip: the list's Publish and RSVP toggles resubmit the
   * entire record, so a field they drop is a field they silently erase.
   */
  test("round-trips through the form", () => {
    const values = readEventBody(
      { ...valid, heroLogo: " s3:events/x/logo-v1.png " },
      GENRE_LIST,
    );
    const input = toEventInput("x", values, GENRE_LIST);
    assert.equal(input.heroLogo, "s3:events/x/logo-v1.png");
    assert.equal(
      eventToFormValues(input, GENRE_LIST).heroLogo,
      "s3:events/x/logo-v1.png",
    );
  });

  test("is optional, and blank stores null", () => {
    assert.equal(validateEvent({ ...valid, heroLogo: "" }).heroLogo, undefined);
    assert.equal(toEventInput("x", { ...valid, heroLogo: "  " }, GENRE_LIST).heroLogo, null);
  });

  test("rejects remote and traversing refs, exactly like the photograph", () => {
    for (const heroLogo of [
      "https://evil.example/x.png",
      "//evil.example/x.png",
      "/media/../../etc/passwd",
      "javascript:alert(1)",
    ]) {
      assert.ok(
        validateEvent({ ...valid, heroLogo }).heroLogo,
        `expected "${heroLogo}" to be rejected`,
      );
    }
    assert.equal(
      validateEvent({ ...valid, heroLogo: "s3:events/x/logo-v1.png" }).heroLogo,
      undefined,
    );
  });

  test("a record written before the field existed reads as empty", () => {
    const { heroLogo, ...older } = toEventInput("x", valid, GENRE_LIST);
    assert.equal(heroLogo, null);
    assert.equal(
      eventToFormValues(older as Parameters<typeof eventToFormValues>[0], GENRE_LIST)
        .heroLogo,
      "",
    );
  });
});

describe("the hero logo size", () => {
  test("round-trips, and defaults to medium", () => {
    assert.equal(readEventBody({ ...valid }, GENRE_LIST).heroLogoSize, "md");
    const values = readEventBody({ ...valid, heroLogoSize: "lg" }, GENRE_LIST);
    const input = toEventInput("x", values, GENRE_LIST);
    assert.equal(input.heroLogoSize, "lg");
    assert.equal(eventToFormValues(input, GENRE_LIST).heroLogoSize, "lg");
  });

  test("an unknown size is refused rather than stored", () => {
    assert.ok(validateEvent({ ...valid, heroLogoSize: "xl" }).heroLogoSize);
    assert.equal(validateEvent({ ...valid, heroLogoSize: "sm" }).heroLogoSize, undefined);
  });

  test("a record from before the field reads as medium", () => {
    const { heroLogoSize, ...older } = toEventInput("x", valid, GENRE_LIST);
    assert.equal(heroLogoSize, "md");
    assert.equal(
      eventToFormValues(older as Parameters<typeof eventToFormValues>[0], GENRE_LIST)
        .heroLogoSize,
      "md",
    );
  });
});

describe("hero logo spacing", () => {
  /**
   * Set from the live editor while looking at the hero. The fields ride the
   * same whole-event PUT as everything else, so the round trip and the
   * survive-the-toggles property are what matter.
   */
  test("round-trips, and defaults to zero", () => {
    const bare = readEventBody({ ...valid }, GENRE_LIST);
    assert.equal(bare.heroLogoPadTop, "0");
    assert.equal(bare.heroLogoPadBottom, "0");

    const values = readEventBody(
      { ...valid, heroLogoPadTop: 3, heroLogoPadBottom: "2" },
      GENRE_LIST,
    );
    const input = toEventInput("x", values, GENRE_LIST);
    assert.equal(input.heroLogoPadTop, 3);
    assert.equal(input.heroLogoPadBottom, 2);
    const back = eventToFormValues(input, GENRE_LIST);
    assert.equal(back.heroLogoPadTop, "3");
    assert.equal(back.heroLogoPadBottom, "2");
  });

  test("rejects out-of-range and junk spacing", () => {
    assert.ok(validateEvent({ ...valid, heroLogoPadTop: "9" }).heroLogoPadTop);
    assert.ok(validateEvent({ ...valid, heroLogoPadTop: "-5" }).heroLogoPadTop);
    assert.ok(validateEvent({ ...valid, heroLogoPadBottom: "abc" }).heroLogoPadBottom);
    // Negative is allowed down to -4: a control that can only add space cannot
    // fix a gap.
    assert.equal(validateEvent({ ...valid, heroLogoPadTop: "-4" }).heroLogoPadTop, undefined);
    assert.equal(validateEvent({ ...valid, heroLogoPadTop: "8" }).heroLogoPadTop, undefined);
  });

  test("a record from before the fields reads as zero", () => {
    const { heroLogoPadTop, heroLogoPadBottom: _dropped, ...older } = toEventInput(
      "x",
      valid,
      GENRE_LIST,
    );
    assert.equal(heroLogoPadTop, 0);
    const back = eventToFormValues(
      older as Parameters<typeof eventToFormValues>[0],
      GENRE_LIST,
    );
    assert.equal(back.heroLogoPadTop, "0");
    assert.equal(back.heroLogoPadBottom, "0");
  });
});

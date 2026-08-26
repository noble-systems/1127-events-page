import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EMPTY_EVENT,
  eventToFormValues,
  isValidEventId,
  parsePriceCents,
  priceToForm,
  readEventBody,
  slugify,
  toEventInput,
  toTicketTiers,
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

describe("isValidEventId", () => {
  test("accepts exactly what slugify produces", () => {
    assert.equal(isValidEventId("sun-club"), true);
    assert.equal(isValidEventId("mirage"), true);
    assert.equal(isValidEventId("night-2"), true);
  });

  test("rejects anything slugify would change", () => {
    assert.equal(isValidEventId(""), false);
    assert.equal(isValidEventId("Sun Club"), false);
    assert.equal(isValidEventId("café"), false);
    assert.equal(isValidEventId("x".repeat(61)), false);
  });

  /** The store's bookkeeping rows can never be claimed as a URL. */
  test("rejects reserved row ids", () => {
    assert.equal(isValidEventId("__seed__"), false);
    assert.equal(isValidEventId("__content__"), false);
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

  test("turns a blank image into null", () => {
    const input = toEventInput("x", { ...valid, image: "" }, GENRE_LIST);
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

describe("ticket prices parse like money", () => {
  test("the ways people type prices", () => {
    assert.equal(parsePriceCents("15"), 1500);
    assert.equal(parsePriceCents("15.5"), 1550);
    assert.equal(parsePriceCents("15.50"), 1550);
    assert.equal(parsePriceCents("$1,250.75"), 125075);
  });

  test("junk is refused, not rounded", () => {
    assert.equal(parsePriceCents(""), null);
    assert.equal(parsePriceCents("free"), null);
    assert.equal(parsePriceCents("15.999"), null);
    assert.equal(parsePriceCents("-5"), null);
  });

  test("cents render back without noise", () => {
    assert.equal(priceToForm(1500), "15");
    assert.equal(priceToForm(1550), "15.50");
  });
});

describe("tier ids are minted once and never move", () => {
  test("new rows get slugs, colliding names stay distinct", () => {
    const tiers = toTicketTiers([
      { id: "", name: "Early Bird", price: "15", capacity: "25", hidden: false, soldOut: false },
      { id: "", name: "GA", price: "20", capacity: "400", hidden: false, soldOut: false },
      { id: "", name: "GA", price: "30", capacity: "50", hidden: false, soldOut: false },
    ]);
    assert.deepEqual(
      tiers.map((tier) => tier.id),
      ["early-bird", "ga", "ga-2"],
    );
    assert.equal(tiers[0].priceCents, 1500);
    assert.equal(tiers[1].capacity, 400);
  });

  test("a renamed tier keeps the id its sales are counted under", () => {
    const tiers = toTicketTiers([
      { id: "early-bird", name: "Early Bird II", price: "18", capacity: "30", hidden: false, soldOut: false },
    ]);
    assert.equal(tiers[0].id, "early-bird");
    assert.equal(tiers[0].name, "Early Bird II");
  });
});

/**
 * The wipe this guards against: the events list resubmits whole records
 * through eventToFormValues -> JSON -> readEventBody -> toEventInput every
 * time a checkbox is toggled. A field that does not survive that loop is
 * silently erased by the next unrelated save.
 */
describe("ticket tiers survive the full form round-trip", () => {
  test("record to form to JSON to input, nothing lost", () => {
    const record = {
      name: "Mirage",
      tagline: "t",
      summary: "s",
      status: "On sale",
      date: "Aug 30",
      location: "Old Town",
      tags: [],
      genres: [],
      tone: "dusk" as const,
      featured: false,
      published: true,
      rsvpEnabled: true,
      ticketsEnabled: true,
      ticketTiers: [
        { id: "early-bird", name: "Early Bird", priceCents: 1500, capacity: 25 },
        { id: "ga", name: "GA", priceCents: 2050, capacity: 400 },
      ],
      order: 0,
      shotNote: "",
      image: null,
      imageAlt: "",
      ctaLabel: "Tickets",
      ctaAction: "tickets" as const,
      emailSubject: null,
      emailHeading: null,
      emailBody: null,
    };

    const values = eventToFormValues(record, []);
    const wired = readEventBody(JSON.parse(JSON.stringify(values)), []);
    const input = toEventInput("mirage", wired, []);

    assert.equal(input.ticketsEnabled, true);
    assert.deepEqual(input.ticketTiers, record.ticketTiers);
    assert.equal(input.ctaAction, "tickets");
  });

  test("records from before ticketing round-trip to empty, not to broken", () => {
    const values = readEventBody({ name: "X" }, []);
    assert.equal(values.ticketsEnabled, false);
    assert.deepEqual(values.tickets, []);
    const input = toEventInput("x", values, []);
    assert.deepEqual(input.ticketTiers, []);
  });
});

describe("hidden tiers survive the round-trip too", () => {
  test("hidden true persists; absent stays absent", () => {
    const tiers = toTicketTiers([
      { id: "eb", name: "Early Bird", price: "15", capacity: "25", hidden: true, soldOut: false },
      { id: "ga", name: "GA", price: "20", capacity: "400", hidden: false, soldOut: false },
    ]);
    assert.equal(tiers[0].hidden, true);
    assert.equal("hidden" in tiers[1], false, "false is not stored");

    const values = readEventBody({ tickets: tiers }, []);
    assert.equal(values.tickets[0].hidden, true);
    assert.equal(values.tickets[1].hidden, false);
  });
});

/**
 * The wipe the events-list toggles nearly caused: they resubmit the RAW
 * record, whose tiers live under `ticketTiers`, while the form posts
 * `tickets`. Reading only the form's key returned an empty list, which
 * failed validation on selling events and silently erased tiers on the
 * rest.
 */
describe("readEventBody accepts the stored ticketTiers key too", () => {
  test("a raw record round-trips its tiers", () => {
    const values = readEventBody(
      {
        name: "Mirage",
        ticketsEnabled: true,
        ticketTiers: [
          { id: "eb", name: "Early Bird", priceCents: 1500, capacity: 25 },
        ],
      },
      [],
    );
    assert.equal(values.tickets.length, 1);
    assert.equal(values.tickets[0].id, "eb");
    assert.equal(values.tickets[0].price, "15");
    const input = toEventInput("mirage", values, []);
    assert.deepEqual(input.ticketTiers, [
      { id: "eb", name: "Early Bird", priceCents: 1500, capacity: 25 },
    ]);
  });

  test("the form's own key wins when both exist", () => {
    const values = readEventBody(
      {
        tickets: [{ id: "a", name: "A", price: "10", capacity: "5" }],
        ticketTiers: [{ id: "b", name: "B", priceCents: 2000, capacity: 9 }],
      },
      [],
    );
    assert.equal(values.tickets[0].id, "a");
  });
});

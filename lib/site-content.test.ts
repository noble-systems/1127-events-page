import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CONTENT_FIELDS, CONTENT_GROUPS, isEditableKey } from "./content-schema.ts";
import {
  defaultContent,
  mergeContent,
  normaliseValue,
  readPath,
  writePath,
} from "./site-content.ts";

describe("the schema matches the real content", () => {
  test("every editable key resolves against the defaults", () => {
    // This is the test that catches the schema drifting from content/site.ts.
    // A key that no longer resolves would silently do nothing in the dashboard,
    // which looks like "saving is broken" rather than "the schema is stale".
    const content = defaultContent();
    const broken: string[] = [];
    for (const key of CONTENT_FIELDS.keys()) {
      if (readPath(content, key) === undefined) broken.push(key);
    }
    assert.deepEqual(broken, [], `keys that do not resolve: ${broken.join(", ")}`);
  });

  test("every key is unique", () => {
    const all = CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    assert.equal(new Set(all).size, all.length, "duplicate keys in the schema");
  });

  test("every image field has alt text alongside it", () => {
    // A photograph without a description is an accessibility hole and hurts
    // search. Pairing them in the schema is what makes the editor show them
    // together.
    const images = [...CONTENT_FIELDS.values()].filter((f) => f.kind === "image");
    // Ambassadors plus the eight media tiles. The hero and series-intro
    // photographs are deliberately NOT here: both come from whichever event is
    // featured, so offering them in the content editor too would be two places
    // to change one thing. If this count moves, check that was intentional.
    assert.equal(images.length, 9, `expected 9 image fields, got ${images.length}`);
    for (const image of images) {
      const alt = [...CONTENT_FIELDS.values()].find((f) => f.altFor === image.key);
      assert.ok(alt, `no alt-text field for ${image.key}`);
    }
  });

  test("the media grid covers all eight tiles", () => {
    const tiles = [...CONTENT_FIELDS.keys()].filter((k) =>
      /^mediaSlots\.\d+\.image$/.test(k),
    );
    assert.equal(tiles.length, 8);
    const defaults = defaultContent();
    assert.equal(defaults.mediaSlots.length, 8, "slot count drifted");
  });
});

describe("readPath and writePath", () => {
  test("reads nested and indexed paths", () => {
    const c = defaultContent();
    assert.equal(typeof readPath(c, "hero.title"), "string");
    assert.equal(typeof readPath(c, "finalCta.guests.title"), "string");
    assert.ok("imageAlt" in (readPath(c, "mediaSlots.0") as object));
  });

  test("returns undefined instead of throwing on a bad path", () => {
    const c = defaultContent();
    assert.equal(readPath(c, "nope.at.all"), undefined);
    assert.equal(readPath(c, "hero.title.deeper"), undefined);
    assert.equal(readPath(c, "mediaSlots.99.image"), undefined);
  });

  test("writes only where structure already exists", () => {
    const c = defaultContent();
    assert.equal(writePath(c, "hero.title", "New"), true);
    assert.equal(readPath(c, "hero.title"), "New");
    // Refuses to invent structure, so schema drift surfaces instead of hiding.
    assert.equal(writePath(c, "invented.path", "x"), false);
    assert.equal(writePath(c, "mediaSlots.99.image", "x"), false);
  });
});

describe("mergeContent", () => {
  test("no overrides gives exactly the committed defaults", () => {
    assert.deepEqual(mergeContent(null), defaultContent());
    assert.deepEqual(mergeContent({}), defaultContent());
  });

  test("applies an override", () => {
    const merged = mergeContent({ "ambassadors.title": "Moon Club" });
    assert.equal(merged.ambassadors.title, "Moon Club");
    // Everything else untouched.
    assert.equal(merged.ambassadors.intro, defaultContent().ambassadors.intro);
  });

  test("sets an image on a media tile", () => {
    const merged = mergeContent({ "mediaSlots.2.image": "s3:events/x/hero.jpg" });
    assert.equal(merged.mediaSlots[2]?.image, "s3:events/x/hero.jpg");
    assert.equal(merged.mediaSlots[0]?.image, null, "other tiles unaffected");
  });

  test("an empty string reverts to the default rather than blanking the page", () => {
    // Clearing a field in the dashboard must restore the committed copy. If it
    // wrote through, a stray keystroke would empty a section on the live site.
    const merged = mergeContent({ "ambassadors.title": "   " });
    assert.equal(merged.ambassadors.title, defaultContent().ambassadors.title);
  });

  test("ignores keys that are not in the schema", () => {
    // This is the layer that renders the public site, so it does not trust the
    // store even though writes are validated.
    const merged = mergeContent({
      "ambassadors.title": "Fine",
      "contact.email": "attacker@example.com",
      "__proto__.polluted": "yes",
      "brand.domain": "https://evil.example",
    });
    assert.equal(merged.ambassadors.title, "Fine");
    assert.equal(isEditableKey("contact.email"), false);
    assert.equal(
      ({} as Record<string, unknown>).polluted,
      undefined,
      "prototype pollution",
    );
  });

  test("does not mutate the module-level defaults across calls", () => {
    // Sections run per request in the same Lambda. A leaked mutation would show
    // one visitor's override to everybody.
    const first = mergeContent({ "ambassadors.title": "Once" });
    assert.equal(first.ambassadors.title, "Once");
    const second = mergeContent(null);
    assert.equal(second.ambassadors.title, defaultContent().ambassadors.title);
  });

  test("null and undefined overrides are skipped", () => {
    const merged = mergeContent({
      "ambassadors.title": null,
      "ambassadors.intro": undefined,
    });
    assert.equal(merged.ambassadors.title, defaultContent().ambassadors.title);
    assert.equal(merged.ambassadors.intro, defaultContent().ambassadors.intro);
  });
});

describe("normaliseValue", () => {
  test("trims text and treats blank as no override", () => {
    assert.equal(normaliseValue("text", "  hello  "), "hello");
    assert.equal(normaliseValue("text", "   "), null);
    assert.equal(normaliseValue("text", ""), null);
    assert.equal(normaliseValue("text", 42), null);
  });

  test("splits a list on newlines, dropping blanks", () => {
    assert.deepEqual(normaliseValue("list", "one\n\ntwo\n  three  \n"), [
      "one",
      "two",
      "three",
    ]);
    assert.equal(normaliseValue("list", "\n \n"), null);
  });

  test("accepts an array for a list", () => {
    assert.deepEqual(normaliseValue("list", ["a", " b ", ""]), ["a", "b"]);
  });
});

describe("the series intro follows the featured event", () => {
  test("no field the featured event owns is also editable as content", () => {
    // Two places to change one thing is how the intro ends up describing last
    // month's event. The event record owns these; the content editor must not.
    // sunClub.details is deliberately NOT in this list. The section replaces
    // Date, Setting and Venue with the event's own values and keeps the rest,
    // so what is stored here is series-level (Music, Talent, Arc, Dress,
    // Energy) and has no event to contradict. Those rows were otherwise
    // uneditable anywhere.
    for (const key of [
      "sunClub.image",
      "sunClub.imageAlt",
      "sunClub.shotNote",
    ]) {
      assert.equal(
        CONTENT_FIELDS.has(key),
        false,
        `${key} is owned by the featured event and must not be editable here`,
      );
    }
  });

  test("the fallback copy is still editable for when nothing is featured", () => {
    assert.equal(CONTENT_FIELDS.has("sunClub.title"), true);
    assert.equal(CONTENT_FIELDS.has("sunClub.paragraphs"), true);
  });
});

describe("the hero follows the featured event", () => {
  test("no field the featured event owns is also editable as content", () => {
    // Hardcoding these is what made the headline keep naming last month's event
    // after somebody featured a new one.
    for (const key of [
      "hero.title",
      "hero.tagline",
      "hero.date",
      "hero.location",
      "hero.image",
      "hero.imageAlt",
    ]) {
      assert.equal(
        CONTENT_FIELDS.has(key),
        false,
        `${key} is owned by the featured event and must not be editable here`,
      );
    }
  });

  test("brand framing that is not event-specific stays editable", () => {
    assert.equal(CONTENT_FIELDS.has("hero.body"), true);
  });

  test("the line above the event name is a constant, not content", () => {
    // "1127 Events Presents" is the company introducing a night, and it is the
    // same sentence on every screen that shows one. It used to come from
    // hero.eyebrow here and from the event's own `series` field on the cards,
    // which meant the same event could be introduced two different ways. Both
    // are gone; see PRESENTS in content/site.ts.
    for (const key of ["hero.eyebrow", "sunClub.eyebrow"]) {
      assert.equal(CONTENT_FIELDS.has(key), false, `${key} is a constant now`);
    }
  });
});

describe("pairs fields", () => {
  /**
   * Two-column rows: the series details table and the partner list. They are
   * arrays of objects rather than strings, and having no field kind for them
   * was why whole blocks of the page could not be edited anywhere at all.
   */
  test('splits "Label: value" on the first colon only', () => {
    // Values contain colons. Splitting on every one would eat the text.
    assert.deepEqual(normaliseValue("pairs", "Arc: Afternoon: into golden hour"), [
      { label: "Arc", value: "Afternoon: into golden hour" },
    ]);
  });

  test("uses the property names the section reads", () => {
    assert.deepEqual(
      normaliseValue("pairs", "Audience strategy: Built before the date.", [
        "title",
        "body",
      ]),
      [{ title: "Audience strategy", body: "Built before the date." }],
    );
  });

  test("a line with no colon keeps what was typed", () => {
    // Dropping it would silently delete a row somebody was midway through.
    assert.deepEqual(normaliseValue("pairs", "Dress"), [
      { label: "Dress", value: "" },
    ]);
  });

  test("blank lines are dropped and an empty result is no override", () => {
    assert.deepEqual(normaliseValue("pairs", "A: 1\n\n  \nB: 2"), [
      { label: "A", value: "1" },
      { label: "B", value: "2" },
    ]);
    assert.equal(normaliseValue("pairs", "\n  \n"), null);
  });

  test("round-trips an array back to text", () => {
    const rows = [{ label: "Music", value: "House, all day" }];
    assert.deepEqual(normaliseValue("pairs", rows), rows);
  });
});

describe("the schema covers what the page actually renders", () => {
  /**
   * The gap this closes.
   *
   * The schema held forty fields while the homepage rendered considerably more,
   * so entire blocks (the details table, all three ambassador lists, the
   * partner list, the heading above the events) were not editable in the
   * dashboard or on the page. Nothing errored; they simply could not be
   * changed, and the only way to notice was to try.
   */
  const mustBeEditable = [
    "upcoming.eyebrow",
    "upcoming.title",
    "upcoming.intro",
    "sunClub.details",
    "ambassadors.doTitle",
    "ambassadors.does",
    "ambassadors.forTitle",
    "ambassadors.communities",
    "ambassadors.benefitsTitle",
    "ambassadors.benefits",
    "partner.brings",
  ];

  for (const key of mustBeEditable) {
    test(`${key} is editable`, () => {
      assert.ok(CONTENT_FIELDS.has(key), `${key} is rendered but not editable`);
      assert.notEqual(
        readPath(defaultContent(), key),
        undefined,
        `${key} does not resolve against the defaults`,
      );
    });
  }
});

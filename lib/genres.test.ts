import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_GENRES,
  isGenre,
  mergeEventIds,
  mergeGenres,
  normaliseGenres,
} from "./genres.ts";

/** The list is editable now, so tests pass it explicitly rather than assuming. */
const LIST = DEFAULT_GENRES;

describe("the vocabulary itself", () => {
  test("has no duplicates", () => {
    assert.equal(new Set(DEFAULT_GENRES).size, DEFAULT_GENRES.length);
  });

  test("has no leading or trailing whitespace", () => {
    // A stray space produces a genre that looks identical on screen and never
    // matches, which is exactly the silent split this list exists to prevent.
    for (const genre of DEFAULT_GENRES)
      assert.equal(genre, genre.trim(), `"${genre}"`);
  });
});

describe("isGenre", () => {
  test("accepts exact members only", () => {
    assert.equal(isGenre("House", LIST), true);
    assert.equal(isGenre("Drum & Bass", LIST), true);
  });

  test("rejects near-misses, which is the point", () => {
    for (const value of [
      "house",
      "HOUSE",
      " House",
      "House ",
      "House music",
      "Housey",
      "",
      null,
      undefined,
      42,
      ["House"],
    ]) {
      assert.equal(
        isGenre(value, LIST),
        false,
        `accepted ${JSON.stringify(value)}`,
      );
    }
  });
});

describe("normaliseGenres", () => {
  test("keeps recognised values and drops the rest", () => {
    assert.deepEqual(normaliseGenres(["House", "nonsense", "Techno"], LIST), [
      "House",
      "Techno",
    ]);
  });

  test("trims, so a value pasted with whitespace still counts", () => {
    assert.deepEqual(normaliseGenres([" House ", "Techno"], LIST), [
      "House",
      "Techno",
    ]);
  });

  test("de-duplicates", () => {
    assert.deepEqual(normaliseGenres(["House", "House", "House"], LIST), ["House"]);
  });

  test("returns canonical order regardless of input order", () => {
    // Two records with the same genres must compare and display identically, and
    // a segment count must not depend on the order boxes were ticked.
    const a = normaliseGenres(["Techno", "House", "Bass"], LIST);
    const b = normaliseGenres(["Bass", "Techno", "House"], LIST);
    assert.deepEqual(a, b);
    assert.deepEqual(a, ["House", "Techno", "Bass"]);
  });

  test("accepts a comma-separated string", () => {
    assert.deepEqual(normaliseGenres("House, Techno", LIST), ["House", "Techno"]);
  });

  test("survives junk", () => {
    for (const junk of [null, undefined, 42, {}, [null, 1, {}]]) {
      assert.deepEqual(normaliseGenres(junk, LIST), []);
    }
  });
});

describe("mergeGenres", () => {
  test("unions rather than replacing", () => {
    // The heart of the feature. Somebody who came to a house party and later a
    // bass night belongs to both audiences; replacing would erase the first and
    // they would stop hearing about what they originally came for.
    assert.deepEqual(mergeGenres(["House"], ["Bass"], LIST), ["House", "Bass"]);
  });

  test("re-signing up for the same kind of event changes nothing", () => {
    assert.deepEqual(mergeGenres(["House"], ["House"], LIST), ["House"]);
  });

  test("works from empty on either side", () => {
    assert.deepEqual(mergeGenres([], ["House"], LIST), ["House"]);
    assert.deepEqual(mergeGenres(["House"], [], LIST), ["House"]);
    assert.deepEqual(mergeGenres(undefined, undefined, LIST), []);
  });

  test("an unrecognised incoming genre cannot poison a record", () => {
    assert.deepEqual(mergeGenres(["House"], ["Polka"], LIST), ["House"]);
  });

  test("stays in canonical order after several merges", () => {
    let genres = mergeGenres([], ["Techno"], LIST);
    genres = mergeGenres(genres, ["House"], LIST);
    genres = mergeGenres(genres, ["Dubstep"], LIST);
    assert.deepEqual(genres, ["House", "Techno", "Dubstep"]);
  });
});

describe("mergeEventIds", () => {
  test("appends a new event, keeping history", () => {
    assert.deepEqual(mergeEventIds(["sun-club"], ["moon-club"]), [
      "sun-club",
      "moon-club",
    ]);
  });

  test("does not duplicate a repeat signup for the same event", () => {
    assert.deepEqual(mergeEventIds(["sun-club"], ["sun-club"]), ["sun-club"]);
  });

  test("accepts a bare string on either side", () => {
    assert.deepEqual(mergeEventIds("sun-club", "moon-club"), [
      "sun-club",
      "moon-club",
    ]);
  });

  test("preserves the order somebody actually signed up in", () => {
    // Unlike genres, this is a history, so first-seen order is the useful one.
    let ids = mergeEventIds([], ["c"]);
    ids = mergeEventIds(ids, ["a"]);
    ids = mergeEventIds(ids, ["b"]);
    assert.deepEqual(ids, ["c", "a", "b"]);
  });

  test("drops blanks and junk", () => {
    assert.deepEqual(
      mergeEventIds(["sun-club", "", "  "], [null, 5, "moon-club"]),
      ["sun-club", "moon-club"],
    );
  });
});

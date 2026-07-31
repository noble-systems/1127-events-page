import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CONTENT_GROUPS } from "./content-schema.ts";
import {
  defaultContent,
  mergeContent,
  normaliseValue,
  readPath,
  type ContentOverrides,
} from "./site-content.ts";

/**
 * The live editor previews the page by running the field values through the
 * same transformation the save endpoint uses, then the same merge the public
 * page uses. These pin that the two stay one path.
 *
 * A preview that computes its own version of "what saving would do" is the kind
 * of thing that agrees for months and then quietly disagrees on the one case
 * nobody tried.
 */

const FIELDS = new Map(
  CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f] as const)),
);

/** Mirrors draftFrom in components/admin/LiveEditor.tsx. */
function draftFrom(values: Record<string, string>) {
  const overrides: ContentOverrides = {};
  for (const [key, raw] of Object.entries(values)) {
    const field = FIELDS.get(key);
    if (!field) continue;
    const value = normaliseValue(field.kind, raw);
    if (value === null) continue;
    overrides[key] = value;
  }
  return mergeContent(overrides);
}

/** Mirrors the PUT handler in app/api/admin/content/route.ts. */
function savedFrom(values: Record<string, string>) {
  const overrides: ContentOverrides = {};
  for (const [key, raw] of Object.entries(values)) {
    const field = FIELDS.get(key);
    if (!field) continue;
    const value = normaliseValue(field.kind, raw);
    if (value === null) continue;
    overrides[key] = value;
  }
  return mergeContent(overrides);
}

const textField = CONTENT_GROUPS.flatMap((g) => g.fields).find(
  (f) => f.kind === "textarea" || f.kind === "text",
)!;
const listField = CONTENT_GROUPS.flatMap((g) => g.fields).find(
  (f) => f.kind === "list",
)!;

describe("the preview shows what saving would produce", () => {
  test("an edited field", () => {
    const values = { [textField.key]: "A new line of copy." };
    assert.deepEqual(draftFrom(values), savedFrom(values));
    assert.equal(readPath(draftFrom(values), textField.key), "A new line of copy.");
  });

  test("a cleared field falls back to the committed default", () => {
    // The case that matters most: clearing a box must preview the shipped
    // wording, not a blank section, because that is what the live page does.
    const values = { [textField.key]: "   " };
    const draft = draftFrom(values);
    assert.deepEqual(draft, savedFrom(values));
    assert.deepEqual(
      readPath(draft, textField.key),
      readPath(defaultContent(), textField.key),
    );
  });

  test("a list drops blank lines the same way in both", () => {
    const values = { [listField.key]: "One\n\n  \nTwo\n" };
    assert.deepEqual(draftFrom(values), savedFrom(values));
    assert.deepEqual(readPath(draftFrom(values), listField.key), ["One", "Two"]);
  });

  test("a list of nothing but blank lines is no override at all", () => {
    // normaliseValue returns null here. Re-implementing the split in the editor
    // would have produced an empty array and rendered an empty section.
    const values = { [listField.key]: "\n   \n\n" };
    assert.deepEqual(
      readPath(draftFrom(values), listField.key),
      readPath(defaultContent(), listField.key),
    );
  });

  test("a key that is not an editable field is ignored", () => {
    const values = { "not.a.field": "x", __genres__: "y" };
    assert.deepEqual(draftFrom(values), defaultContent());
  });

  test("no edits at all previews exactly the committed content", () => {
    assert.deepEqual(draftFrom({}), defaultContent());
  });
});

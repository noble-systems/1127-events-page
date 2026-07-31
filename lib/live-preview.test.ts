import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CONTENT_FIELDS, CONTENT_GROUPS } from "./content-schema.ts";
import { normaliseField } from "./content-values.ts";
import { defaultContent, mergeContent, readPath } from "./site-content.ts";

/**
 * The live editor previews a change by running the field values through
 * normaliseField and then mergeContent, which is exactly what saving does.
 *
 * The previous version of this file re-implemented both sides and compared them
 * to each other. They agreed, and they were both wrong: neither passed the
 * field's pairKeys, so a pairs field with custom property names was written as
 * {label, value} everywhere while the section read {value, label}. On screen the
 * two halves of the facts strip swapped and then collapsed into each other.
 *
 * A test that mirrors the implementation twice cannot catch the implementation
 * being wrong. These assert against the schema and the rendered shape instead.
 */

const textField = CONTENT_GROUPS.flatMap((g) => g.fields).find(
  (f) => f.kind === "textarea" || f.kind === "text",
)!;
const listField = CONTENT_GROUPS.flatMap((g) => g.fields).find(
  (f) => f.kind === "list",
)!;

function draft(values: Record<string, string>) {
  const overrides: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(values)) {
    const value = normaliseField(key, raw);
    if (value === null || value === undefined) continue;
    overrides[key] = value;
  }
  return mergeContent(overrides);
}

describe("a pairs field keeps the property names its section reads", () => {
  /**
   * The regression this pins. Every pairs field is checked, so adding one with
   * new property names cannot reintroduce it.
   */
  const pairFields = [...CONTENT_FIELDS.values()].filter(
    (f) => f.kind === "pairs",
  );

  test("there are some, so this suite is not vacuous", () => {
    assert.ok(pairFields.length > 0);
  });

  for (const field of pairFields) {
    test(`${field.key} round-trips into the shape the page renders`, () => {
      const [left, right] = field.pairKeys ?? ["label", "value"];
      const merged = draft({ [field.key]: "Alpha: Beta" });
      const rows = readPath(merged, field.key) as Record<string, string>[];

      assert.deepEqual(rows, [{ [left]: "Alpha", [right]: "Beta" }]);

      // The committed default uses the same property names, which is what the
      // section destructures. If these disagree the page renders undefined.
      const shipped = readPath(defaultContent(), field.key) as Record<
        string,
        string
      >[];
      assert.deepEqual(
        Object.keys(rows[0]).sort(),
        Object.keys(shipped[0]).sort(),
        `${field.key} previews different property names than it ships with`,
      );
    });
  }
});

describe("the preview is what saving produces", () => {
  test("an edited field", () => {
    const merged = draft({ [textField.key]: "A new line of copy." });
    assert.equal(readPath(merged, textField.key), "A new line of copy.");
  });

  test("a cleared field falls back to the committed default", () => {
    // Clearing a box must preview the shipped wording, not a blank section,
    // because that is what the live page does.
    const merged = draft({ [textField.key]: "   " });
    assert.deepEqual(
      readPath(merged, textField.key),
      readPath(defaultContent(), textField.key),
    );
  });

  test("a list drops blank lines", () => {
    const merged = draft({ [listField.key]: "One\n\n  \nTwo\n" });
    assert.deepEqual(readPath(merged, listField.key), ["One", "Two"]);
  });

  test("a list of nothing but blank lines is no override at all", () => {
    const merged = draft({ [listField.key]: "\n   \n\n" });
    assert.deepEqual(
      readPath(merged, listField.key),
      readPath(defaultContent(), listField.key),
    );
  });

  test("a key that is not an editable field is ignored", () => {
    assert.deepEqual(draft({ "not.a.field": "x", __genres__: "y" }), defaultContent());
  });

  test("no edits at all previews exactly the committed content", () => {
    assert.deepEqual(draft({}), defaultContent());
  });
});

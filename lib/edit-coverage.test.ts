import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { CONTENT_FIELDS } from "./content-schema.ts";

/**
 * Every editable field must be reachable by clicking it.
 *
 * The live editor is the only content editor now, so a field in the schema with
 * no wrapper on the page is a field nobody can change. That is not
 * hypothetical: hero.body was dropped from the hero when the hero was thought to
 * be entirely event-derived, and the form editor that still offered it was
 * removed a day later. Between the two, the opening paragraph of the homepage
 * became uneditable, and nothing failed or warned. The button labels beside it
 * had never been editable at all.
 *
 * This reads the component sources for the paths handed to the edit wrappers,
 * so a field added to the schema without being wired up fails here rather than
 * being found by somebody hunting for where to click.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const sources = sourceFiles("components")
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

/**
 * A wired path to a matcher for schema keys.
 *
 * The media tiles are mapped, so their path is a template literal:
 * "mediaSlots.${index}.image" has to match "mediaSlots.3.image". Splitting on
 * the placeholder and escaping each literal chunk is safer than escaping the
 * whole string and then unescaping the placeholder back out of it.
 */
function toMatcher(wiredPath: string): RegExp {
  const chunks = wiredPath
    .split(/\$\{[^}]+\}/)
    .map((chunk) => chunk.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
  return new RegExp(`^${chunks.join(String.raw`\d+`)}$`);
}

/** Paths passed to Editable, EditItem, EditPair, EditAdd and EditableImage. */
const wired = [
  ...sources.matchAll(/(?:path|altPath)=(?:"([^"]+)"|\{`([^`]+)`\})/g),
]
  .map((match) => match[1] ?? match[2])
  .map(toMatcher);

describe("every editable field is reachable on the page", () => {
  test("the source scan actually found the wrappers", () => {
    // A regex that quietly stopped matching would make every assertion below
    // vacuously pass, which is the failure mode of a test that reads source.
    assert.ok(wired.length > 30, `only found ${wired.length} wired paths`);
  });

  for (const key of CONTENT_FIELDS.keys()) {
    test(key, () => {
      assert.ok(
        wired.some((pattern) => pattern.test(key)),
        `${key} is in the schema but nothing on the page edits it, so it cannot be changed at all`,
      );
    });
  }
});

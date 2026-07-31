import { CONTENT_GROUPS, type ContentField } from "./content-schema.ts";
import { normaliseValue } from "./site-content.ts";

/**
 * Turning stored content into the text a box shows, and back.
 *
 * These lived alongside the form editor's field rows. That editor is gone, and
 * the live editor needs only these three, so they moved out of components and
 * into lib where they can be tested without React.
 */

export type Values = Record<string, string>;

export const FIELD_BY_KEY = new Map(
  CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f] as const)),
);

/** A stored value as editable text. Lists and pairs become one item per line. */
export function toFormValue(field: ContentField, stored: unknown): string {
  if (stored === undefined || stored === null) return "";

  if (field.kind === "pairs") {
    const [left, right] = field.pairKeys ?? ["label", "value"];
    return Array.isArray(stored)
      ? stored
          .map((row) =>
            row && typeof row === "object"
              ? `${(row as Record<string, string>)[left] ?? ""}: ${(row as Record<string, string>)[right] ?? ""}`
              : String(row),
          )
          .join("\n")
      : String(stored);
  }

  if (field.kind === "list") {
    return Array.isArray(stored) ? stored.join("\n") : String(stored);
  }

  return String(stored);
}

/**
 * The committed default as text.
 *
 * Used to decide whether a value is a genuine edit. A value equal to this is
 * sent as empty, which the save endpoint stores as no override, so a later copy
 * change in the repo still reaches the live page.
 */
export function defaultAsText(field: ContentField, fallback: unknown): string {
  if (fallback === undefined || fallback === null) return "";
  if (field.kind === "pairs") return toFormValue(field, fallback);
  if (Array.isArray(fallback)) return fallback.join("\n");
  return String(fallback);
}

/**
 * Normalises one submitted value for its field.
 *
 * The single place that decides what a raw box becomes. It existed in two:
 * the save endpoint passed the field's pairKeys and the live preview did not,
 * so a pairs field with custom property names was written as {label, value}
 * in the preview and {value, label} on save. The facts strip renders
 * `fact.value` large and `fact.label` small, so on screen the two halves
 * swapped and then collapsed into each other as the bad shape fed back into
 * the editable spans.
 *
 * A test compared preview against save and passed, because it re-implemented
 * both sides the same wrong way. Sharing the function is the fix that a test
 * could not be.
 *
 * Returns null for "no override", which is how a cleared field falls back to
 * the committed default, and undefined for a key that is not a field at all.
 */
export function normaliseField(key: string, raw: unknown): unknown {
  const field = FIELD_BY_KEY.get(key);
  if (!field) return undefined;
  return normaliseValue(field.kind, raw, field.pairKeys);
}

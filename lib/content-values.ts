import { CONTENT_GROUPS, type ContentField } from "./content-schema.ts";

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

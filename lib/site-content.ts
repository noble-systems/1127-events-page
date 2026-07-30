import {
  ambassadors,
  finalCta,
  hero,
  mediaSection,
  mediaSlots,
  partner,
  sunClub,
} from "../content/site.ts";
import { CONTENT_FIELDS, isEditableKey } from "./content-schema.ts";

/**
 * Homepage content: the defaults in content/site.ts, with any dashboard edits
 * layered on top.
 *
 * The defaults are never mutated and never removed. An override is stored only
 * for a field somebody actually changed, so an empty store, a wiped table, or a
 * DynamoDB outage all render exactly the site that is committed to the repo
 * rather than a page full of blanks. That property is the whole reason this is
 * an overlay rather than a migration of the content into the database.
 *
 * The pure merge lives here so it can be tested without AWS; the storage driver
 * is in lib/store.
 */

export type ContentOverrides = Record<string, unknown>;

/** The shape sections consume. Same as the static exports, post-merge. */
export type SiteContent = {
  hero: typeof hero;
  sunClub: typeof sunClub;
  ambassadors: typeof ambassadors;
  mediaSection: typeof mediaSection;
  mediaSlots: typeof mediaSlots;
  partner: typeof partner;
  finalCta: typeof finalCta;
};

export function defaultContent(): SiteContent {
  // Structured clone so a caller mutating the result cannot corrupt the module
  // level constants for every other request in the same Lambda.
  return structuredClone({
    hero,
    sunClub,
    ambassadors,
    mediaSection,
    mediaSlots,
    partner,
    finalCta,
  }) as SiteContent;
}

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reads a dot path, with numeric segments indexing arrays.
 * Returns undefined rather than throwing on a path that does not exist.
 */
export function readPath(source: unknown, key: string): unknown {
  let node: unknown = source;
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Writes a dot path in place.
 *
 * Deliberately refuses to create missing intermediate objects. Every editable
 * key corresponds to a field that already exists in the defaults, so a path
 * that does not resolve means the schema and content/site.ts have drifted, and
 * silently inventing structure would hide that.
 */
export function writePath(target: unknown, key: string, value: unknown): boolean {
  const segments = key.split(".");
  const last = segments.pop();
  if (!last) return false;

  let node: unknown = target;
  for (const segment of segments) {
    if (node === null || typeof node !== "object") return false;
    node = (node as Record<string, unknown>)[segment];
  }
  if (node === null || typeof node !== "object") return false;

  (node as Record<string, unknown>)[last] = value;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Merge                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Applies stored overrides to a fresh copy of the defaults.
 *
 * Unknown keys are ignored rather than applied. The store is written through a
 * validating route, but this is the layer that actually renders the public
 * site, so it does not trust what it reads: a key that is not in the schema, or
 * that no longer resolves after a refactor, is skipped and the default stands.
 */
export function mergeContent(overrides: ContentOverrides | null): SiteContent {
  const content = defaultContent();
  if (!overrides) return content;

  for (const [key, value] of Object.entries(overrides)) {
    if (!isEditableKey(key)) continue;
    if (value === null || value === undefined) continue;

    const field = CONTENT_FIELDS.get(key);
    if (!field) continue;

    // An empty string means "revert to the default", not "render nothing".
    // Without this, clearing a field in the dashboard would blank the section
    // rather than restore the committed copy.
    if (typeof value === "string" && value.trim() === "") continue;
    if (field.kind === "list" && Array.isArray(value) && value.length === 0)
      continue;

    writePath(content, key, value);
  }

  return content;
}

/**
 * Normalises one submitted value for storage.
 *
 * Lists arrive from a textarea as newline-separated text; everything else is a
 * trimmed string. Returning null means "no override", which is how a field gets
 * reset to the committed default.
 */
export function normaliseValue(kind: string, raw: unknown): unknown {
  if (kind === "list") {
    const lines =
      typeof raw === "string"
        ? raw.split("\n")
        : Array.isArray(raw)
          ? raw.map(String)
          : [];
    const items = lines.map((line) => line.trim()).filter(Boolean);
    return items.length ? items : null;
  }

  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

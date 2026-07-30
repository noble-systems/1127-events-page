/**
 * Musical genres, as a controlled vocabulary.
 *
 * Deliberately separate from an event's free-text `tags`, which are display
 * copy ("Poolside", "Day into golden hour") and mix genre with atmosphere.
 * Segmentation cannot be built on those: typed freely, the same audience ends
 * up split across "house", "House" and "House music", and the split is silent.
 * You only find out when a promo goes to the wrong people.
 *
 * These values are stored on records, so treat them as data rather than labels.
 * Adding a genre is safe. RENAMING one orphans every person already tagged with
 * the old value, so add a new entry and migrate instead.
 */

/**
 * Seed list, used until an admin edits it. After that the stored list wins.
 *
 * Kept in code so a fresh deploy has sensible genres and an unreachable store
 * still renders a usable event form, exactly like content/site.ts.
 */
export const DEFAULT_GENRES = [
  "House",
  "Tech House",
  "Techno",
  "Melodic / Progressive",
  "Bass",
  "Dubstep",
  "Drum & Bass",
  "Disco / Funk",
  "Hip Hop / R&B",
  "Latin",
  "Open Format",
] as const;

export type Genre = string;

/**
 * Whether a value is one of the genres currently in use.
 *
 * Takes the list rather than closing over a constant, because the list is now
 * editable and a stale copy would silently reject genres an admin just created.
 */
export function isGenre(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

/**
 * Keeps only recognised genres, de-duplicated, in the canonical order of the
 * list passed in.
 *
 * `allowed` is required, deliberately. It used to default to the seed list, and
 * that default silently discarded every genre an admin had created: an event
 * saved with ["House", "Rave"] came back as ["House"] with nothing to say why.
 * Making it required means the compiler finds any caller that does not have the
 * live list, rather than that caller quietly losing data.
 *
 * Canonical order rather than input order so two records with the same genres
 * always compare and display identically, and so a segment count cannot depend
 * on the sequence somebody happened to tick boxes in.
 */
export function normaliseGenres(
  input: unknown,
  allowed: readonly string[],
): Genre[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (isGenre(trimmed, allowed)) seen.add(trimmed);
  }

  // Canonical order is the order of the list itself, so two records with the
  // same genres always compare and display identically.
  return allowed.filter((genre) => seen.has(genre));
}

/**
 * Merges a person's existing genre affinity with the genres of an event they
 * just signed up for.
 *
 * A union, not a replacement, and that is the whole point of this feature.
 * Somebody who came to a house party in June and a bass night in August belongs
 * to both audiences; overwriting would quietly erase the June affinity and they
 * would stop hearing about the thing they originally came for.
 */
export function mergeGenres(
  existing: unknown,
  incoming: unknown,
  allowed: readonly string[],
): Genre[] {
  return normaliseGenres(
    [...normaliseGenres(existing, allowed), ...normaliseGenres(incoming, allowed)],
    allowed,
  );
}

/** Union of ids, order-stable and de-duplicated. Same reasoning as genres. */
export function mergeEventIds(existing: unknown, incoming: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const source of [existing, incoming]) {
    const values = Array.isArray(source) ? source : source ? [source] : [];
    for (const value of values) {
      const id = typeof value === "string" ? value.trim() : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }

  return out;
}

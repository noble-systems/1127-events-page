import type { EventRecord, SubmissionRecord } from "./types.ts";

/**
 * Adding, renaming and deleting genres.
 *
 * Genres are stored on events AND on every person who signed up from one, so
 * the list is not just a dropdown: it is a set of values duplicated across two
 * tables. That makes rename and delete data migrations rather than edits.
 *
 * Getting this wrong is quiet. Rename "House" without migrating and every house
 * patron keeps a genre that no longer exists, matches no segment, and never
 * hears from you again. Nothing errors. The list just gets smaller.
 *
 * The planning here is pure so the migration can be tested without AWS, and so
 * the dashboard can show the true blast radius before anyone commits to it.
 */

export type GenreChange =
  | { kind: "add"; name: string }
  | { kind: "rename"; from: string; to: string }
  | { kind: "delete"; name: string };

export type ChangePlan = {
  /** The list after the change. */
  genres: string[];
  /** Events whose genres change, with their new value. */
  events: Array<{ id: string; genres: string[] }>;
  /** People whose genres change, with their new value. */
  people: Array<{ pk: string; genres: string[] }>;
  /** Blocks the change entirely. */
  error?: string;
};

const MAX_LENGTH = 40;

/**
 * A genre has to be typeable, displayable, and stable as a stored value.
 * Rejecting punctuation that needs escaping keeps it safe in a CSV cell and in
 * a URL query parameter without per-use-site handling.
 */
export function validateGenreName(
  name: string,
  existing: readonly string[],
): string | null {
  const trimmed = name.trim();

  if (!trimmed) return "Give the genre a name.";
  if (trimmed.length > MAX_LENGTH) return `Keep it under ${MAX_LENGTH} characters.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 &/'+-]*$/.test(trimmed)) {
    return "Letters, numbers, spaces and & / ' + - only.";
  }
  // Case-insensitive, because "house" and "House" would look like one genre in
  // the list and behave as two everywhere else.
  if (existing.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
    return `"${trimmed}" already exists.`;
  }

  return null;
}

/**
 * Works out everything a change touches, without applying it.
 *
 * Returned so the dashboard can say "this renames a genre on 2 events and 143
 * people" before anyone presses the button, and so the same numbers drive both
 * the warning and the write.
 */
export function planChange(
  current: readonly string[],
  change: GenreChange,
  events: readonly Pick<EventRecord, "id" | "genres">[],
  people: readonly Pick<SubmissionRecord, "pk" | "genres">[],
): ChangePlan {
  const empty = { genres: [...current], events: [], people: [] };

  if (change.kind === "add") {
    const error = validateGenreName(change.name, current);
    if (error) return { ...empty, error };
    return { ...empty, genres: [...current, change.name.trim()] };
  }

  if (change.kind === "rename") {
    if (!current.includes(change.from)) {
      return { ...empty, error: `"${change.from}" is not in the list.` };
    }
    const to = change.to.trim();
    // Compare against the list minus the one being renamed, so correcting the
    // capitalisation of a genre is allowed.
    const others = current.filter((g) => g !== change.from);
    const error = validateGenreName(to, others);
    if (error) return { ...empty, error };

    return {
      genres: current.map((g) => (g === change.from ? to : g)),
      events: events
        .filter((e) => (e.genres ?? []).includes(change.from))
        .map((e) => ({
          id: e.id,
          genres: (e.genres ?? []).map((g) => (g === change.from ? to : g)),
        })),
      people: people
        .filter((p) => (p.genres ?? []).includes(change.from))
        .map((p) => ({
          pk: p.pk,
          genres: (p.genres ?? []).map((g) => (g === change.from ? to : g)),
        })),
    };
  }

  // delete
  if (!current.includes(change.name)) {
    return { ...empty, error: `"${change.name}" is not in the list.` };
  }

  return {
    genres: current.filter((g) => g !== change.name),
    events: events
      .filter((e) => (e.genres ?? []).includes(change.name))
      .map((e) => ({
        id: e.id,
        genres: (e.genres ?? []).filter((g) => g !== change.name),
      })),
    people: people
      .filter((p) => (p.genres ?? []).includes(change.name))
      .map((p) => ({
        pk: p.pk,
        genres: (p.genres ?? []).filter((g) => g !== change.name),
      })),
  };
}

/** One-line summary of the blast radius, for a confirmation. */
export function describePlan(plan: ChangePlan): string {
  const parts: string[] = [];
  if (plan.events.length) {
    parts.push(`${plan.events.length} event${plan.events.length === 1 ? "" : "s"}`);
  }
  if (plan.people.length) {
    parts.push(
      `${plan.people.length} ${plan.people.length === 1 ? "person" : "people"}`,
    );
  }
  return parts.length ? parts.join(" and ") : "nothing else";
}

import { normaliseStatus, type SubmissionRecord } from "./types.ts";

/**
 * Segmenting the mailing list.
 *
 * The point of this module is deciding who receives a send, so it errs toward
 * excluding people. A promo that misses someone is a missed opportunity; one
 * that reaches someone who unsubscribed, or who only ever came to a house
 * party and is now getting dubstep, is the thing that gets a domain reported
 * and a list burned.
 *
 * Pure, so the counts on screen and the addresses in an export are produced by
 * exactly the same code and cannot disagree.
 */

export type Segment = {
  /** Restrict to people who signed up from these events. Empty means any. */
  eventIds?: string[];
  /** Restrict to people carrying at least one of these genres. Empty means any. */
  genres?: string[];
  /**
   * Only people who can actually be emailed.
   *
   * On by default. Turning it off is for looking at the data, never for
   * building a send.
   */
  mailableOnly?: boolean;
};

/**
 * Whether we may send marketing email to this person.
 *
 * Three separate conditions, and all of them matter:
 *   - they asked for it (marketingOptIn)
 *   - they have not since unsubscribed or hard-bounced
 *   - they are on the mailing list rather than an applicant who never opted in
 */
export function isMailable(record: SubmissionRecord): boolean {
  if (record.marketingOptIn !== true) return false;
  const status = normaliseStatus(record.type, record.status);
  return status !== "unsubscribed" && status !== "bounced";
}

/** Does this person match the segment? */
export function matches(record: SubmissionRecord, segment: Segment): boolean {
  if (segment.mailableOnly !== false && !isMailable(record)) return false;

  const wantEvents = segment.eventIds?.filter(Boolean) ?? [];
  if (wantEvents.length > 0) {
    const theirs = record.eventIds ?? [];
    if (!wantEvents.some((id) => theirs.includes(id))) return false;
  }

  const wantGenres = segment.genres?.filter(Boolean) ?? [];
  if (wantGenres.length > 0) {
    const theirs = record.genres ?? [];
    // "Any of", not "all of". Somebody tagged House and Techno belongs in a
    // House send; requiring every selected genre would produce almost empty
    // segments and quietly under-send.
    if (!wantGenres.some((genre) => theirs.includes(genre))) return false;
  }

  return true;
}

export function selectAudience(
  records: readonly SubmissionRecord[],
  segment: Segment,
): SubmissionRecord[] {
  return records.filter((record) => matches(record, segment));
}

/* -------------------------------------------------------------------------- */
/* Counts                                                                     */
/* -------------------------------------------------------------------------- */

export type Tally = { key: string; label: string; total: number; mailable: number };

/**
 * How many people each event has brought in.
 *
 * Reports mailable separately from total on purpose: the difference is the
 * number of people you hold but may not email, and seeing 400 next to 120 is
 * the moment somebody realises the opt-in rate is the problem rather than the
 * list size.
 */
export function tallyByEvent(
  records: readonly SubmissionRecord[],
  events: readonly { id: string; name: string }[],
): Tally[] {
  return events
    .map((event) => {
      const inEvent = records.filter((r) => (r.eventIds ?? []).includes(event.id));
      return {
        key: event.id,
        label: event.name,
        total: inEvent.length,
        mailable: inEvent.filter(isMailable).length,
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function tallyByGenre(
  records: readonly SubmissionRecord[],
  genres: readonly string[],
): Tally[] {
  return genres
    .map((genre) => {
      const inGenre = records.filter((r) => (r.genres ?? []).includes(genre));
      return {
        key: genre,
        label: genre,
        total: inGenre.length,
        mailable: inGenre.filter(isMailable).length,
      };
    })
    .filter((tally) => tally.total > 0);
}

/**
 * People with no event attribution at all.
 *
 * Everybody who signed up before this feature existed lands here, and so does
 * anybody who reached /rsvp with no event featured. They are invisible to every
 * genre segment, so surfacing the number stops the list quietly shrinking
 * without anyone noticing.
 */
export function unattributed(
  records: readonly SubmissionRecord[],
): SubmissionRecord[] {
  return records.filter((r) => (r.eventIds ?? []).length === 0);
}

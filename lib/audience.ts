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
 * The mailing list is RSVPs, and only RSVPs. Somebody who applied to DJ, or who
 * wrote in about hosting an event at their venue, came to us for something
 * specific: they are a working contact, not an audience for a promo. Marketing
 * to them because they filled in a form is how a business contact becomes a
 * spam complaint, and it is the sort of thing that reads as sharp practice even
 * when it is technically permitted.
 *
 * Applications and inquiries still live in People, where the team works them.
 * They are simply not a send target.
 *
 * Three conditions, all required:
 *   - it is an RSVP, so they asked to hear about events
 *   - they opted in
 *   - they have not since unsubscribed or hard-bounced
 */
export function isMailable(record: SubmissionRecord): boolean {
  if (record.type !== "rsvp") return false;
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

/**
 * The mailing list: RSVPs only.
 *
 * Every count on the Audience screen runs through this first, so an applicant
 * can never inflate a number that is used to decide who gets a send.
 */
export function mailingList(
  records: readonly SubmissionRecord[],
): SubmissionRecord[] {
  return records.filter((record) => record.type === "rsvp");
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

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Subscription is not the same thing as the RSVP list, and conflating them was
 * a bug worth naming.
 *
 * An RSVP is a fact: this person said they were coming to this night. It stays
 * true forever. A subscription is a standing preference: whether they want to
 * hear about the next one. It can be withdrawn at any time, and withdrawing it
 * says nothing about the nights they already came to.
 *
 * The unsubscribe route used to delete every row for the address, which erased
 * both at once, along with the record of the opt-out itself.
 */
export type SubscriptionState = "subscribed" | "unsubscribed" | "bounced";

export function subscriptionState(record: SubmissionRecord): SubscriptionState {
  const status = normaliseStatus(record.type, record.status);
  if (status === "bounced") return "bounced";
  // Never opted in, or opted out: both mean "do not email", but only the second
  // is an unsubscribe. `unsubscribedAt` is what tells them apart.
  if (status === "unsubscribed" || record.unsubscribedAt) return "unsubscribed";
  return record.marketingOptIn === true ? "subscribed" : "unsubscribed";
}

/** Everyone on the RSVP list, whatever their subscription says. */
export function rsvpList(
  records: readonly SubmissionRecord[],
): SubmissionRecord[] {
  return records.filter((record) => record.type === "rsvp");
}

/**
 * The list itself: everybody you may email right now, newest first.
 *
 * This is the same test isMailable applies before a send, so what is on screen
 * and what actually receives a promo cannot disagree.
 */
export function subscribed(
  records: readonly SubmissionRecord[],
): SubmissionRecord[] {
  return rsvpList(records)
    .filter(isMailable)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Opt-outs, newest first, with how each one happened.
 *
 * Manual ones are the reason this exists. A click on the footer link and a hard
 * bounce are both recorded elsewhere; somebody asking to come off the list at
 * the door is not, so if the dashboard does not show it, nothing does.
 */
export function unsubscribes(
  records: readonly SubmissionRecord[],
): SubmissionRecord[] {
  return records
    .filter(
      (record) =>
        record.type === "rsvp" && subscriptionState(record) !== "subscribed",
    )
    .sort((a, b) =>
      (b.unsubscribedAt ?? b.updatedAt).localeCompare(
        a.unsubscribedAt ?? a.updatedAt,
      ),
    );
}

export type SubscriptionSummary = {
  rsvps: number;
  subscribed: number;
  unsubscribed: number;
  bounced: number;
  /** Of the unsubscribes, how many an admin recorded by hand. */
  manual: number;
};

export function subscriptionSummary(
  records: readonly SubmissionRecord[],
): SubscriptionSummary {
  const list = rsvpList(records);
  const summary: SubscriptionSummary = {
    rsvps: list.length,
    subscribed: 0,
    unsubscribed: 0,
    bounced: 0,
    manual: 0,
  };

  for (const record of list) {
    summary[subscriptionState(record)] += 1;
    if (record.unsubscribedSource === "admin") summary.manual += 1;
  }

  return summary;
}

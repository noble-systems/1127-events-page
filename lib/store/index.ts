import { randomUUID } from "node:crypto";
import { LEGAL_VERSION, seedEvents } from "@/content/site";
import type { RequestMeta } from "@/lib/request-meta";
import { DEFAULT_GENRES, mergeEventIds, mergeGenres } from "@/lib/genres";
import { isSuppressed } from "@/lib/audience";
import { smsConsentFrom } from "@/lib/sms";
import { defaultStatusFor } from "@/lib/types";
import type {
  EventRecord,
  NewEventInput,
  SubmissionRecord,
  SubmissionStatus,
  SubmissionType,
  UnsubscribeSource,
} from "@/lib/types";
import { mergeContent, type SiteContent } from "@/lib/site-content";
import { dynamoStore } from "./dynamo";
import { localStore } from "./local";
import type { Store } from "./types";

/**
 * Driver selection
 * ----------------
 *   DynamoDB  when EVENTS_TABLE + SUBMISSIONS_TABLE are set (deployed)
 *   local     otherwise, in development only
 *
 * In production without those variables we throw a clear error rather than
 * silently writing to a filesystem that Lambda will discard.
 */
export function store(): Store {
  const configured = Boolean(
    process.env.EVENTS_TABLE && process.env.SUBMISSIONS_TABLE,
  );

  if (configured) return dynamoStore;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "EVENTS_TABLE and SUBMISSIONS_TABLE are not set. Deploy infra/1127-infra.yaml and add the outputs to the Amplify environment variables.",
    );
  }

  return localStore;
}

export function storeKind(): "dynamodb" | "local" | "unconfigured" {
  try {
    return store().kind;
  } catch {
    return "unconfigured";
  }
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

function byDisplayOrder(a: EventRecord, b: EventRecord) {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Bookkeeping row that records "the launch content has already been imported".
 * Without it, deleting every event would silently resurrect the seeds on the
 * next request. It is filtered out of every listing.
 */
const SEED_MARKER_ID = "__seed__";
/** Homepage content overrides live in this table too; see the dynamo driver. */
const CONTENT_ROW_ID = "__content__";

function isMarker(row: EventRecord) {
  // Both reserved rows are filtered from every listing. Missing the content row
  // here would render it as a broken event on the public site.
  return row.id === SEED_MARKER_ID || row.id === CONTENT_ROW_ID;
}

async function writeSeedMarker(): Promise<void> {
  const now = new Date().toISOString();
  await store().putEvent({
    ...seedEvents[0],
    id: SEED_MARKER_ID,
    name: "seed marker",
    published: false,
    featured: false,
    order: 999,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Single read of the events table that imports the launch content the first
 * time the store is used, so the public site and the dashboard can never
 * disagree about which events exist.
 *
 * The marker row, not an in-process flag, is what makes this idempotent.
 * Memoising "we already seeded" in module scope looked cheaper but left the
 * app permanently empty if the table was ever cleared out from under a running
 * instance; re-reading the marker every time is one scan we were doing anyway.
 */
async function loadEvents(): Promise<EventRecord[]> {
  let rows = await store().listEvents();

  if (!rows.some(isMarker)) {
    // Only import when there is genuinely nothing there. A store that predates
    // the marker keeps its data and just gets marked.
    if (rows.length === 0) {
      for (const event of seedEvents) {
        await store().putEvent(event);
      }
      rows = [...seedEvents];
      console.info(`[1127] imported ${seedEvents.length} launch events`);
    }

    await writeSeedMarker();
  }

  return rows.filter((row) => !isMarker(row));
}

/**
 * Events for the public site.
 *
 * Falls back to the launch content only when the store is genuinely
 * unreachable, an empty store is seeded instead, so "no events in the
 * dashboard" and "events on the site" can never both be true.
 */
export async function listPublicEvents(): Promise<EventRecord[]> {
  try {
    const rows = await loadEvents();
    return rows.filter((row) => row.published).sort(byDisplayOrder);
  } catch (error) {
    console.error("[1127] events unavailable, using launch content:", error);
    return seedEvents.filter((event) => event.published);
  }
}

export async function listAllEvents(): Promise<EventRecord[]> {
  return (await loadEvents()).sort(byDisplayOrder);
}

/** Admin listing that reports store failures instead of throwing. */
export async function listAllEventsSafe(): Promise<{
  events: EventRecord[];
  error: string | null;
}> {
  try {
    return { events: await listAllEvents(), error: null };
  } catch (error) {
    return {
      events: [],
      error:
        error instanceof Error ? error.message : "The events store is unreachable.",
    };
  }
}

export async function getEvent(id: string): Promise<EventRecord | null> {
  return store().getEvent(id);
}

/**
 * Clears Featured everywhere except `keepId`.
 *
 * Featured is a single slot, not a label. It drives the hero, /rsvp and the
 * confirmation email, all of which talk about "the next one" in the singular,
 * so two featured events would make each of those reads arbitrary. Ticking it
 * on one event therefore unticks it on the rest instead of letting the admin
 * create a state the site cannot render.
 */
async function claimFeatured(keepId: string): Promise<void> {
  const others = (await listAllEvents()).filter(
    (event) => event.featured && event.id !== keepId,
  );
  const now = new Date().toISOString();
  // Sequential for the same reason as suppressEmail: the local driver's
  // read-modify-write loses concurrent updates.
  for (const event of others) {
    await store().putEvent({ ...event, featured: false, updatedAt: now });
  }
}

/**
 * Hands Featured to the next event in line.
 *
 * The featured event drives the hero, /rsvp and the confirmation email, so
 * unpublishing it used to leave the site with no hero and the RSVP address
 * pointing nowhere, which is a strange thing to happen because somebody hid a
 * draft. Display order decides who is next, since that is the order the page
 * already presents them in.
 *
 * `exclude` is the event on its way out: it is passed in because the caller has
 * not written the change yet, so the store still says it is published.
 */
async function promoteNextFeatured(exclude: string): Promise<void> {
  const next = (await listAllEvents()).find(
    (event) => event.published && event.id !== exclude,
  );
  if (!next) return;

  await store().putEvent({
    ...next,
    featured: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function createEvent(input: NewEventInput): Promise<EventRecord> {
  const now = new Date().toISOString();
  // Same rule updateEvent applies: a draft cannot hold the featured slot. This
  // path missed it, so POSTing a featured draft stripped Featured from the live
  // event and left the site with nothing featured at all.
  const featured = input.featured && input.published;
  if (featured) await claimFeatured(input.id);
  return store().putEvent({ ...input, featured, createdAt: now, updatedAt: now });
}

export async function updateEvent(
  existing: EventRecord,
  input: NewEventInput,
): Promise<EventRecord> {
  if (input.featured) await claimFeatured(existing.id);

  // A draft cannot be the featured event: the hero would describe something no
  // visitor can reach.
  const losingTheSlot = existing.featured && !input.published;
  if (losingTheSlot) await promoteNextFeatured(existing.id);

  return store().putEvent({
    ...input,
    id: existing.id,
    // URL history rides along: the form knows nothing about formerIds, and an
    // ordinary save must not amputate the redirects old links depend on.
    formerIds: existing.formerIds,
    featured: input.published ? input.featured : false,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Moves an event to a new id, which is its public RSVP URL.
 *
 * The name can change and the URL should be able to follow it, but the old
 * address is already out in the world in texts, bios and printed QR codes. So
 * the old id joins formerIds on the record, /rsvp of a former id redirects
 * permanently, and every submission's RSVP history is rewritten so audience
 * segments built on the event keep matching the people who signed up under
 * the old address.
 *
 * Order is deliberate for crash safety: write the new row, move the history,
 * delete the old row last. Dying part way leaves the event existing twice,
 * which a retry converges; it can never exist zero times.
 */
export async function renameEvent(
  existing: EventRecord,
  newId: string,
): Promise<EventRecord> {
  const renamed = await store().putEvent({
    ...existing,
    id: newId,
    // Renaming back along a cycle (a → b → a) drops the target from history
    // rather than letting an id alias itself.
    formerIds: [
      ...(existing.formerIds ?? []).filter((id) => id !== newId),
      existing.id,
    ],
    updatedAt: new Date().toISOString(),
  });

  for (const row of await store().listSubmissions()) {
    if (!(row.eventIds ?? []).includes(existing.id)) continue;
    const eventIds = Array.from(
      new Set(
        (row.eventIds ?? []).map((id) => (id === existing.id ? newId : id)),
      ),
    );
    await updateSubmission(row.pk, { eventIds });
  }

  await store().deleteEvent(existing.id);
  return renamed;
}

export async function deleteEvent(id: string): Promise<void> {
  // Same reasoning as unpublishing. Deleting the featured event should not
  // leave the homepage without a hero.
  const existing = await store().getEvent(id);
  if (existing?.featured) await promoteNextFeatured(id);
  return store().deleteEvent(id);
}

/**
 * Moves Featured to one event, or clears it when `id` is null.
 *
 * Used by the events list, where Featured is a choice between events rather
 * than a box on each one. A tick per event let you set two, or none, and left
 * the hero to guess.
 */
export async function setFeaturedEvent(id: string | null): Promise<void> {
  if (id === null) {
    await claimFeatured("");
    return;
  }

  const event = await store().getEvent(id);
  // Refuses to feature a draft, so the list cannot create the state the rule
  // above exists to prevent.
  if (!event || !event.published) return;

  await claimFeatured(id);
  if (!event.featured) {
    await store().putEvent({
      ...event,
      featured: true,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Re-adds any launch event that is missing, a recovery path for "we deleted
 * Sun Club by mistake". Existing events are never overwritten.
 */
export async function restoreLaunchContent(): Promise<number> {
  const existing = await store().listEvents();
  const present = new Set(existing.map((event) => event.id));

  let created = 0;
  for (const event of seedEvents) {
    if (present.has(event.id)) continue;
    await store().putEvent(event);
    created += 1;
  }

  if (!existing.some(isMarker)) await writeSeedMarker();
  return created;
}

/* -------------------------------------------------------------------------- */
/* Submissions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * RSVPs are keyed by email so the mailing list stays deduplicated, someone
 * signing up twice updates their row. Ambassador and partner messages are
 * distinct enquiries, so each one is kept.
 */
function submissionKey(type: SubmissionType, email: string): string {
  if (type === "rsvp") return `rsvp#${email.trim().toLowerCase()}`;
  return `${type}#${randomUUID()}`;
}

/**
 * What a submission actually changed.
 *
 * The route used to infer "is this new" by comparing createdAt to updatedAt,
 * which is only true for a first-ever signup. RSVPs are keyed by email, so
 * somebody signing up for a second event updated their row and got no
 * confirmation at all. Reporting it here means the caller does not have to
 * reverse-engineer intent from timestamps.
 */
export type SubmissionOutcome = {
  record: SubmissionRecord;
  /** No record for this address existed before. */
  isNew: boolean;
  /** They signed up from an event they had not signed up from before. */
  isNewEvent: boolean;
};

export async function recordSubmission(
  type: SubmissionType,
  values: Record<string, string>,
  meta?: RequestMeta,
): Promise<SubmissionOutcome> {
  // Resolve the event this signup came from, so its genres can be recorded
  // against the person. Failure here must not lose the signup, so it degrades
  // to "no attribution" rather than throwing.
  let event: EventRecord | null = null;
  const eventId = (values.eventId ?? "").trim();
  if (eventId) {
    try {
      event = await store().getEvent(eventId);
    } catch (error) {
      console.error("[1127] could not resolve the signup's event", error);
    }
  }
  const now = new Date().toISOString();
  const email = (values.email ?? "").trim().toLowerCase();
  const pk = submissionKey(type, email);

  const existing =
    type === "rsvp"
      ? (await store().listSubmissions("rsvp")).find((row) => row.pk === pk)
      : undefined;

  const liveGenres = event ? await getGenreList() : [];

  // Whether this address has already asked to be left alone. Either marker
  // counts: status is what the RSVP row carries, the timestamp is what an
  // applicant row carries, since "unsubscribed" is not a stage in a review
  // pipeline.
  const suppressed = existing ? isSuppressed(existing) : false;

  const record: SubmissionRecord = {
    pk,
    type,
    email,
    name: values.name ?? "",
    phone: values.phone || undefined,
    social: values.social || undefined,
    community: values.community || undefined,
    role: values.role || undefined,
    termsVersion: values.agreeTerms === "true" ? LEGAL_VERSION : undefined,
    /**
     * A past opt-out outlives a later form submission.
     *
     * This record is rebuilt from scratch on every signup, so ticking the
     * marketing box again used to set marketingOptIn back to true on somebody
     * who had unsubscribed. The suppression survived only because `status` was
     * carried over, leaving a record that claimed to be opted in and opted out
     * at once. Worse, the timestamp and source below were not carried at all,
     * so a re-signup silently erased the record of the opt-out.
     *
     * Somebody who genuinely wants back on says so and an admin re-subscribes
     * them, which stamps resubscribedAt. Quietly re-adding people who once
     * asked to leave is how a domain gets reported.
     */
    marketingOptIn: suppressed ? false : values.marketingOptIn === "true",
    unsubscribedAt: existing?.unsubscribedAt,
    unsubscribedSource: existing?.unsubscribedSource,
    resubscribedAt: existing?.resubscribedAt,
    smsOptIn: smsConsentFrom(values.phone),
    // Union, never replacement. Somebody who signed up for a house night in
    // June and a bass night in August belongs to both audiences; overwriting
    // would erase the first and drop them out of the segment they came for.
    eventIds: event
      ? mergeEventIds(existing?.eventIds, [event.id])
      : existing?.eventIds,
    // Merged against the live list, not the seed, so a genre an admin created
    // today is recorded on somebody signing up today.
    genres: event
      ? mergeGenres(existing?.genres, event.genres, liveGenres)
      : existing?.genres,
    company: values.company || undefined,
    inquiryType: values.inquiryType || undefined,
    message: values.message || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    status: existing?.status ?? defaultStatusFor(type),
    notes: existing?.notes,
    // Latest visit wins: the most recent device and campaign are the useful ones.
    meta: meta ?? existing?.meta,
  };

  const saved = await store().putSubmission(record);

  return {
    record: saved,
    isNew: !existing,
    // A first signup is trivially a new event for them. A repeat only counts if
    // it brought an event they were not already attributed to.
    isNewEvent: Boolean(event && !(existing?.eventIds ?? []).includes(event.id)),
  };
}

export async function listSubmissions(
  type?: SubmissionType,
): Promise<SubmissionRecord[]> {
  return store().listSubmissions(type);
}

export async function getSubmission(pk: string): Promise<SubmissionRecord | null> {
  return store().getSubmission(pk);
}

/**
 * Updates the CRM fields only. The submitted content is a record of what
 * someone actually sent and is never rewritten from the dashboard.
 */
export async function updateSubmissionMeta(
  pk: string,
  patch: { status?: SubmissionStatus; notes?: string },
): Promise<SubmissionRecord | null> {
  const existing = await store().getSubmission(pk);
  if (!existing) return null;

  const status = patch.status ?? existing.status ?? "new";
  const now = new Date().toISOString();

  /**
   * An admin moving somebody to or from "unsubscribed" is an opt-out with no
   * audit trail anywhere else: it happened in person, by text, or at the door.
   * Stamping it here is the only record that it was a person's decision rather
   * than a bounce or a click, and the only way to answer "who took them off,
   * and when" later.
   */
  const wasOut = existing.status === "unsubscribed";
  const nowOut = status === "unsubscribed";

  return store().putSubmission({
    ...existing,
    status,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    ...(nowOut && !wasOut
      ? {
          marketingOptIn: false,
          unsubscribedAt: now,
          unsubscribedSource: "admin" as const,
          resubscribedAt: undefined,
        }
      : {}),
    ...(wasOut && !nowOut
      ? {
          // isMailable reads marketingOptIn, and suppressing cleared it, so a
          // resubscribe that only changed the status left somebody showing as
          // subscribed on one screen and missing from the audience on another.
          marketingOptIn: true,
          resubscribedAt: now,
        }
      : {}),
    updatedAt: now,
  });
}

/**
 * Opts an address out, everywhere, without losing anything.
 *
 * Marks every row for the address rather than removing it. An unsubscribe is a
 * standing instruction, and the record of it is what suppresses them on a later
 * import or a fresh signup, so deleting it deletes the suppression. It also
 * leaves the RSVP history intact: coming to a night in June is a fact, and
 * leaving the mailing list in August does not undo it.
 *
 * Returns how many rows were touched, so the caller can tell a real opt-out
 * from a link for an address that no longer exists.
 */
export async function suppressEmail(
  email: string,
  source: UnsubscribeSource,
): Promise<number> {
  const target = email.trim().toLowerCase();
  const rows = (await store().listSubmissions()).filter(
    (row) => row.email.trim().toLowerCase() === target,
  );
  const now = new Date().toISOString();

  // Sequential, not Promise.all.
  //
  // The local driver keeps every submission in one JSON file and does
  // read-modify-write on it, so concurrent puts read the same starting state
  // and the last one to finish silently discards the others. Suppressing an
  // address that had two records only marked one. DynamoDB writes each item
  // independently and would have been fine, which is exactly why this would
  // have shipped unnoticed. The row count here is tiny.
  for (const row of rows) {
    await store().putSubmission({
      ...row,
      // isMailable requires this, so clearing it suppresses every type at
      // once, including applicants who ticked the box on their form.
      marketingOptIn: false,
      // Only RSVPs carry subscription statuses; an application's status is a
      // review pipeline and "unsubscribed" is not a stage in it.
      status: row.type === "rsvp" ? "unsubscribed" : row.status,
      unsubscribedAt: now,
      unsubscribedSource: source,
      resubscribedAt: undefined,
      updatedAt: now,
    });
  }

  return rows.length;
}

export async function deleteSubmission(pk: string): Promise<void> {
  return store().deleteSubmission(pk);
}

/* -------------------------------------------------------------------------- */
/* Homepage content                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Merged homepage content: the defaults in content/site.ts with any dashboard
 * edits applied.
 *
 * Never throws. If the store is unreachable the committed defaults are returned
 * and the page renders exactly as it does in the repo, which is the whole point
 * of overlaying rather than moving content into the database.
 */
export async function getSiteContent(): Promise<SiteContent> {
  try {
    return mergeContent(await store().getContent());
  } catch (error) {
    console.error("[1127] content overrides unavailable, using defaults:", error);
    return mergeContent(null);
  }
}

/* -------------------------------------------------------------------------- */
/* Genres                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Genres in use, falling back to the seed list in lib/genres.ts.
 *
 * Stored under a reserved key in the same row as the content overrides, so this
 * needs no new table and no new environment variable. Never throws: an
 * unreachable store yields the seed list, so the event form still works.
 */
export async function getGenreList(): Promise<string[]> {
  try {
    const overrides = await store().getContent();
    const stored = overrides?.["__genres__"];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.filter((g): g is string => typeof g === "string" && !!g.trim());
    }
  } catch (error) {
    console.error("[1127] genre list unavailable, using defaults:", error);
  }
  return [...DEFAULT_GENRES];
}

export async function saveGenreList(genres: string[]): Promise<void> {
  const overrides = (await store().getContent()) ?? {};
  await store().putContent({ ...overrides, __genres__: genres });
}

/** Raw overrides, for the dashboard editor. Defaults are applied client-side. */
export async function getContentOverrides(): Promise<Record<string, unknown>> {
  try {
    return (await store().getContent()) ?? {};
  } catch (error) {
    console.error("[1127] could not read content overrides:", error);
    return {};
  }
}

export async function saveContentOverrides(
  overrides: Record<string, unknown>,
): Promise<void> {
  await store().putContent(overrides);
}

/**
 * Rewrites just the genres on an event, leaving everything else alone.
 *
 * Used by the genre migration. A full putEvent would need the whole record and
 * would race with anybody editing that event at the same moment.
 */
export async function updateEventGenres(
  id: string,
  genres: string[],
): Promise<void> {
  const event = await store().getEvent(id);
  if (!event) return;
  await store().putEvent({ ...event, genres, updatedAt: new Date().toISOString() });
}

/** Patches one submission. Same reasoning as updateEventGenres. */
export async function updateSubmission(
  pk: string,
  patch: Partial<SubmissionRecord>,
): Promise<void> {
  const existing = await store().getSubmission(pk);
  if (!existing) return;
  await store().putSubmission({
    ...existing,
    ...patch,
    // Never let a patch rewrite identity.
    pk: existing.pk,
    type: existing.type,
    email: existing.email,
    updatedAt: new Date().toISOString(),
  });
}

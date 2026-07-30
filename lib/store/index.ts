import { randomUUID } from "node:crypto";
import { LEGAL_VERSION, seedEvents } from "@/content/site";
import type { RequestMeta } from "@/lib/request-meta";
import { DEFAULT_GENRES, mergeEventIds, mergeGenres } from "@/lib/genres";
import { smsConsentFrom } from "@/lib/sms";
import { defaultStatusFor } from "@/lib/types";
import type {
  EventRecord,
  NewEventInput,
  SubmissionRecord,
  SubmissionStatus,
  SubmissionType,
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

/**
 * The featured event, or null when nothing is featured.
 *
 * There is deliberately no positional fallback here. Every call site used to
 * end in `?? events[0]`, which meant unticking Featured changed nothing you
 * could see: the first event by display order quietly took over, and Sun Club
 * sorts first, so Sun Club appeared to be permanently featured. Nothing
 * featured now means nothing featured, and the hero and series intro fall back
 * to their static copy, which is the honest reading of it.
 */
export async function featuredEvent(): Promise<EventRecord | null> {
  return (await listPublicEvents()).find((event) => event.featured) ?? null;
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
  await Promise.all(
    others.map((event) =>
      store().putEvent({ ...event, featured: false, updatedAt: now }),
    ),
  );
}

export async function createEvent(input: NewEventInput): Promise<EventRecord> {
  const now = new Date().toISOString();
  if (input.featured) await claimFeatured(input.id);
  return store().putEvent({ ...input, createdAt: now, updatedAt: now });
}

export async function updateEvent(
  existing: EventRecord,
  input: NewEventInput,
): Promise<EventRecord> {
  if (input.featured) await claimFeatured(existing.id);
  return store().putEvent({
    ...input,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteEvent(id: string): Promise<void> {
  return store().deleteEvent(id);
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
    marketingOptIn: values.marketingOptIn === "true",
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

  return store().putSubmission({
    ...existing,
    status: patch.status ?? existing.status ?? "new",
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  });
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

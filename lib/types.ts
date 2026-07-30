import type { RequestMeta } from "./request-meta.ts";

/**
 * Shared domain types for data that lives in DynamoDB.
 *
 * `content/site.ts` still owns static brand copy; anything a human edits from
 * the admin dashboard is modelled here.
 */

export type MediaTone =
  "dusk" | "pool" | "cobalt" | "golden" | "terracotta" | "ink" | "sand";

export const MEDIA_TONES: readonly MediaTone[] = [
  "dusk",
  "pool",
  "cobalt",
  "golden",
  "terracotta",
  "ink",
  "sand",
];

export type CtaAction = "rsvp" | "partner";

export type EventRecord = {
  id: string;
  name: string;
  tagline: string;
  summary: string;
  /**
   * Whether this event is accepting RSVPs.
   *
   * Separate from `published`, because an event can be worth showing on the
   * site long before there is anything to sign up for. "More concepts in
   * development" is the case that forced this: it belongs on the page, but a
   * signup form for it collects addresses against a night that does not exist.
   * With this off the card shows no RSVP button and /rsvp/<id> 404s.
   */
  rsvpEnabled: boolean;
  /**
   * Small badge on the card, e.g. "Announcing Soon", "Tickets Live", "Sold Out".
   *
   * Free text, and deliberately about what state the event is in rather than
   * whether it is featured. This shipped defaulting to "Featured series", which
   * kept claiming Sun Club was featured long after the flag moved to another
   * event. Same trap the old `series` field had: a typed string asserting
   * something the system already tracks, with nothing keeping the two in step.
   */
  status: string;
  /** Free text so "Dates Announcing Soon" is as valid as a real date. */
  date: string;
  location: string;
  venue: string | null;
  tags: string[];
  /**
   * Musical genres from the controlled list in lib/genres.ts.
   *
   * Distinct from `tags`, which is free-text display copy. Segmentation is built
   * on these, so they must be exact members of that list: "house" and "House
   * music" would each become a separate audience nobody notices until a promo
   * reaches the wrong people.
   */
  genres: string[];
  tone: MediaTone;
  /** Large two-column card treatment. */
  featured: boolean;
  /** Hidden from the public site when false. */
  published: boolean;
  /** Ascending; controls card order on the public page. */
  order: number;
  shotNote: string;
  image: string | null;
  imageAlt: string;
  ctaLabel: string;
  ctaAction: CtaAction;

  /**
   * Confirmation email wording for people who RSVP to this event.
   *
   * Named text slots rather than a raw HTML template, deliberately. A free HTML
   * field would let a typo break the layout in Outlook, and would put
   * unescaped markup from a form field into a message we send on our own
   * domain. These are plain text, escaped on render, and dropped into the same
   * branded shell as every other message.
   *
   * All three are optional. Null means "use the standard wording", so an event
   * nobody has customised still sends a good email.
   */
  emailSubject: string | null;
  emailHeading: string | null;
  /** Body copy. Blank lines separate paragraphs. */
  emailBody: string | null;

  createdAt: string;
  updatedAt: string;
};

/**
 * Where a submission sits in the pipeline. Everything arrives as "new"; the
 * rest is for the team to move through as they work it.
 */
export type SubmissionType = "rsvp" | "ambassador" | "partner" | "talent";

export type SubmissionStatus =
  // Applications and inquiries move through a review pipeline.
  | "new"
  | "reviewing"
  | "contacted"
  | "accepted"
  | "declined"
  | "archived"
  // An RSVP is not reviewed. It is a mailing list entry, so it only has a
  // subscription state. "Declining" someone who joined a list is meaningless.
  | "subscribed"
  | "unsubscribed"
  | "bounced";

export const APPLICATION_STATUSES: readonly SubmissionStatus[] = [
  "new",
  "reviewing",
  "contacted",
  "accepted",
  "declined",
  "archived",
];

export const LIST_STATUSES: readonly SubmissionStatus[] = [
  "subscribed",
  "unsubscribed",
  "bounced",
];

/** An RSVP gets subscription states; everything else gets the review pipeline. */
export function statusesFor(type: SubmissionType): readonly SubmissionStatus[] {
  return type === "rsvp" ? LIST_STATUSES : APPLICATION_STATUSES;
}

export function defaultStatusFor(type: SubmissionType): SubmissionStatus {
  return type === "rsvp" ? "subscribed" : "new";
}

/**
 * Records written before the split, or edited by hand, can carry a status that
 * does not belong to their type. Normalise on read rather than trusting it.
 */
export function normaliseStatus(
  type: SubmissionType,
  status: SubmissionStatus | undefined,
): SubmissionStatus {
  const allowed = statusesFor(type);
  if (status && allowed.includes(status)) return status;
  return defaultStatusFor(type);
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  contacted: "Contacted",
  accepted: "Accepted",
  declined: "Declined",
  archived: "Archived",
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
};

export type SubmissionRecord = {
  /** `rsvp#<email>` for the mailing list (deduped), `<type>#<uuid>` otherwise. */
  pk: string;
  type: SubmissionType;
  email: string;
  name: string;
  phone?: string;
  /** Ambassador + talent: social handles, mixes, portfolio links */
  social?: string;
  community?: string;
  /** Talent: the role being applied for */
  role?: string;
  /** Partner */
  company?: string;
  inquiryType?: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  /** Pipeline state. Absent on rows written before this existed, treat as "new". */
  status?: SubmissionStatus;
  /** Internal notes. Never shown to the person who submitted. */
  notes?: string;
  /** Version of the terms and privacy policy accepted at submit time. */
  termsVersion?: string;
  /** Ticked the box asking for event email. Applicants can opt in too. */
  marketingOptIn?: boolean;
  /** Ticked the box allowing day-of text messages. Only asked when a phone is given. */
  smsOptIn?: boolean;

  /**
   * Every event this person has signed up from, oldest first.
   *
   * RSVPs are keyed by email, so a repeat signup updates one row. These
   * accumulate rather than replace: somebody who came for house in June and
   * bass in August belongs to both audiences.
   */
  eventIds?: string[];
  /** Union of the genres of every event above. What promo segments filter on. */
  genres?: string[];
  /** IP, device and campaign captured at submit time. See lib/request-meta.ts. */
  meta?: RequestMeta;
};

export type NewEventInput = Omit<EventRecord, "createdAt" | "updatedAt">;

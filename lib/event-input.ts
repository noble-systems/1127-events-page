import { isValidImageRef } from "./images.ts";
import { normaliseGenres } from "./genres.ts";
import {
  MEDIA_TONES,
  type CtaAction,
  type MediaTone,
  type NewEventInput,
} from "./types.ts";
import type { FormErrors } from "./validation.ts";

/**
 * Validation for the admin event form. Runs on the server for every write;
 * the dashboard form surfaces the same messages inline.
 */

/**
 * One ticket tier as the form holds it: everything a string, price in
 * dollars. `id` is blank on a freshly added row and minted at save time;
 * after that it rides along untouched so renames never orphan sales.
 */
export type TicketTierFormValues = {
  id: string;
  name: string;
  price: string;
  capacity: string;
  hidden: boolean;
  soldOut: boolean;
};

export type EventFormValues = {
  name: string;
  tagline: string;
  summary: string;
  heroBody: string;
  status: string;
  date: string;
  location: string;
  venue: string;
  tags: string;
  genres: string[];
  tone: string;
  featured: boolean;
  published: boolean;
  rsvpEnabled: boolean;
  ticketsEnabled: boolean;
  tickets: TicketTierFormValues[];
  order: string;
  shotNote: string;
  image: string;
  heroLogo: string;
  heroLogoSize: string;
  heroLogoPadTop: string;
  heroLogoPadBottom: string;
  imageAlt: string;
  ctaLabel: string;
  ctaAction: string;
  emailSubject: string;
  emailHeading: string;
  emailBody: string;
};

export const EMPTY_EVENT: EventFormValues = {
  name: "",
  tagline: "",
  summary: "",
  heroBody: "",
  status: "Announcing Soon",
  date: "Dates Announcing Soon",
  location: "Old Town Scottsdale, Arizona",
  venue: "",
  tags: "",
  genres: [],
  tone: "dusk",
  featured: false,
  published: false,
  // New events are usually created to collect signups, so this starts on.
  rsvpEnabled: true,
  // Selling money is opt-in, so this starts off.
  ticketsEnabled: false,
  tickets: [],
  order: "0",
  shotNote: "",
  image: "",
  heroLogo: "",
  heroLogoSize: "md",
  heroLogoPadTop: "0",
  heroLogoPadBottom: "0",
  imageAlt: "",
  // Tickets are the business now; the free list is the fallback.
  ctaLabel: "Get tickets",
  ctaAction: "tickets",
  emailSubject: "",
  emailHeading: "",
  emailBody: "",
};

const REQUIRED: Array<[keyof EventFormValues, string]> = [
  ["name", "Name"],
  ["tagline", "Tagline"],
  ["summary", "Summary"],
  ["status", "Status badge"],
  ["date", "Date"],
  ["location", "Location"],
  ["ctaLabel", "Button label"],
];

const MAX: Partial<Record<keyof EventFormValues, number>> = {
  name: 120,
  tagline: 160,
  summary: 600,
  heroBody: 400,
  status: 40,
  date: 80,
  location: 120,
  venue: 120,
  shotNote: 160,
  imageAlt: 200,
  ctaLabel: 60,
  emailSubject: 120,
  emailHeading: 120,
  emailBody: 2000,
};

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "event"
  );
}

/**
 * True when `value` can be an event id, which is its public URL slug.
 *
 * The test is simply "slugify would leave it unchanged": lowercase letters,
 * digits and hyphens. This also fences off the store's bookkeeping rows
 * (__seed__, __content__), whose underscores slugify never emits.
 */
export function isValidEventId(value: string): boolean {
  return value.length > 0 && slugify(value) === value;
}

export function validateEvent(values: EventFormValues): FormErrors {
  const errors: FormErrors = {};

  for (const [field, label] of REQUIRED) {
    if (!String(values[field] ?? "").trim()) {
      errors[field] = `${label} is required.`;
    }
  }

  for (const [field, max] of Object.entries(MAX)) {
    const value = String(values[field as keyof EventFormValues] ?? "");
    if (value.length > (max as number)) {
      errors[field] = `Too long (max ${max} characters).`;
    }
  }

  if (!MEDIA_TONES.includes(values.tone as MediaTone)) {
    errors.tone = "Choose one of the listed palettes.";
  }

  if (!["rsvp", "partner", "tickets"].includes(values.ctaAction)) {
    errors.ctaAction = "Choose where the button should go.";
  }

  const order = Number(values.order);
  if (!Number.isFinite(order) || order < 0 || order > 999) {
    errors.order = "Order must be a number between 0 and 999.";
  }

  // Either a file under /public or an "s3:" key in the images bucket. The rule
  // lives in lib/images.ts because the upload route needs exactly the same one,
  // and two copies of a security check drift apart.
  if (!isValidImageRef(values.image)) {
    errors.image =
      "Upload a photo, or use a path inside /public such as /media/photo-01.jpg";
  }

  // Same rule as the photograph, same reason: the ref reaches an img src.
  if (!isValidImageRef(values.heroLogo)) {
    errors.heroLogo = "Upload a logo image, or use a path inside /public.";
  }

  if (!["sm", "md", "lg"].includes(values.heroLogoSize)) {
    errors.heroLogoSize = "Pick small, medium or large.";
  }

  for (const field of ["heroLogoPadTop", "heroLogoPadBottom"] as const) {
    const pad = Number(values[field]);
    // Negative pulls the eyebrow or tagline closer than the layout's own
    // margins; a control that can only add space cannot fix a gap.
    if (!Number.isInteger(pad) || pad < -4 || pad > 8) {
      errors[field] = "Spacing is -4 to 8.";
    }
  }

  values.tickets.forEach((tier, index) => {
    if (!tier.name.trim()) {
      errors[`ticket-${index}-name`] = "Every ticket type needs a name.";
    } else if (tier.name.trim().length > 60) {
      errors[`ticket-${index}-name`] = "Too long (max 60 characters).";
    }
    const cents = parsePriceCents(tier.price);
    if (cents === null || cents < 100 || cents > 1_000_000) {
      errors[`ticket-${index}-price`] = "Price is $1 to $10,000.";
    }
    const capacity = Number(tier.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000) {
      errors[`ticket-${index}-capacity`] = "How many can be sold, 1 to 100,000.";
    }
  });
  if (values.tickets.length > 12) {
    errors.tickets = "Twelve ticket types is the ceiling.";
  }
  if (values.ticketsEnabled && values.tickets.length === 0) {
    errors.tickets = "Selling is on but there are no ticket types yet.";
  }

  return errors;
}

/**
 * A price the way people type prices: "15", "15.50", "$1,250". Returns whole
 * cents or null; anything that would lose money in float arithmetic is
 * rejected rather than rounded.
 */
export function parsePriceCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [dollars, cents = "0"] = cleaned.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

/** Cents back to what the form shows: "15" or "15.50", never "15.00". */
export function priceToForm(cents: number): string {
  return Number.isInteger(cents / 100)
    ? String(cents / 100)
    : (cents / 100).toFixed(2);
}

/**
 * Form tier rows to stored tiers. Ids are the load-bearing part: a row that
 * already has one keeps it verbatim (the sold counter and every issued ticket
 * key off it), and a new row gets one minted from its name, deduplicated
 * against its siblings so two tiers named "GA" stay distinguishable.
 */
export function toTicketTiers(
  rows: readonly TicketTierFormValues[],
): NonNullable<NewEventInput["ticketTiers"]> {
  const taken = new Set(rows.map((row) => row.id).filter(Boolean));
  return rows.map((row) => {
    let id = row.id;
    if (!id) {
      const base = slugify(row.name);
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      taken.add(id);
    }
    return {
      id,
      name: row.name.trim(),
      priceCents: parsePriceCents(row.price) ?? 0,
      capacity: Number(row.capacity),
      // Stored only when true, so rows from before these flags stay identical.
      ...(row.hidden === true ? { hidden: true } : {}),
      ...(row.soldOut === true ? { soldOut: true } : {}),
    };
  });
}

/** Assumes `validateEvent` already passed. */
export function toEventInput(
  id: string,
  values: EventFormValues,
  allowedGenres: readonly string[],
): NewEventInput {
  return {
    id,
    name: values.name.trim(),
    tagline: values.tagline.trim(),
    summary: values.summary.trim(),
    heroBody: values.heroBody.trim(),
    status: values.status.trim(),
    date: values.date.trim(),
    location: values.location.trim(),
    venue: values.venue.trim() || null,
    tags: values.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8),
    // Anything off the controlled list is dropped rather than stored, so a
    // crafted payload cannot invent an audience segment.
    genres: normaliseGenres(values.genres, allowedGenres),
    tone: values.tone as MediaTone,
    featured: Boolean(values.featured),
    published: Boolean(values.published),
    rsvpEnabled: Boolean(values.rsvpEnabled),
    ticketsEnabled: Boolean(values.ticketsEnabled),
    ticketTiers: toTicketTiers(values.tickets),
    order: Number(values.order),
    shotNote: values.shotNote.trim(),
    image: values.image.trim() || null,
    heroLogo: values.heroLogo.trim() || null,
    heroLogoSize: values.heroLogoSize as "sm" | "md" | "lg",
    heroLogoPadTop: Number(values.heroLogoPadTop),
    heroLogoPadBottom: Number(values.heroLogoPadBottom),
    imageAlt: values.imageAlt.trim(),
    ctaLabel: values.ctaLabel.trim(),
    ctaAction: values.ctaAction as CtaAction,
    // Blank means "use the standard wording", so store null rather than "".
    emailSubject: values.emailSubject.trim() || null,
    emailHeading: values.emailHeading.trim() || null,
    emailBody: values.emailBody.trim() || null,
  };
}

/**
 * Tier rows from an unknown body. Tolerates the stored TicketTier shape too
 * (priceCents/capacity as numbers), because the events list resubmits whole
 * records through this path when it toggles a checkbox, and a field that
 * shape-shifted between read and write would silently wipe every tier.
 */
function readTicketRows(raw: unknown): TicketTierFormValues[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === "string" ? r.id : "",
      name: typeof r.name === "string" ? r.name : "",
      price:
        typeof r.price === "string"
          ? r.price
          : typeof r.priceCents === "number"
            ? priceToForm(r.priceCents)
            : "",
      capacity:
        typeof r.capacity === "string"
          ? r.capacity
          : typeof r.capacity === "number"
            ? String(r.capacity)
            : "",
      hidden: r.hidden === true || r.hidden === "true",
      soldOut: r.soldOut === true || r.soldOut === "true",
    };
  });
}

/** Normalises an unknown JSON body into form values. */
export function readEventBody(
  body: unknown,
  allowedGenres: readonly string[],
): EventFormValues {
  const raw = (body ?? {}) as Record<string, unknown>;
  const str = (key: keyof EventFormValues) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";

  return {
    name: str("name"),
    tagline: str("tagline"),
    summary: str("summary"),
    heroBody: str("heroBody"),
    status: str("status"),
    date: str("date"),
    location: str("location"),
    venue: str("venue"),
    tags: Array.isArray(raw.tags) ? raw.tags.join(", ") : str("tags"),
    genres: normaliseGenres(raw.genres, allowedGenres),
    tone: str("tone") || "dusk",
    featured: raw.featured === true || raw.featured === "true",
    published: raw.published === true || raw.published === "true",
    // Note the inverted test. published and featured default off, so there the
    // safe read is "only an explicit true counts". This defaults on, so the safe
    // read is the mirror: only an explicit false closes signups. A record
    // written before this field existed, or a payload with a junk value, keeps
    // collecting rather than silently stopping.
    rsvpEnabled: raw.rsvpEnabled !== false && raw.rsvpEnabled !== "false",
    // Money is the opposite of signups: only an explicit true sells.
    ticketsEnabled: raw.ticketsEnabled === true || raw.ticketsEnabled === "true",
    // Both spellings, because two callers exist: the form posts `tickets`
    // (form rows), the events-list toggles resubmit the raw record, which
    // stores `ticketTiers`. Reading only one wiped the other's tiers.
    tickets: readTicketRows(raw.tickets ?? raw.ticketTiers),
    order: typeof raw.order === "number" ? String(raw.order) : str("order") || "0",
    shotNote: str("shotNote"),
    image: str("image"),
    heroLogo: str("heroLogo"),
    heroLogoSize: str("heroLogoSize") || "md",
    heroLogoPadTop:
      typeof raw.heroLogoPadTop === "number"
        ? String(raw.heroLogoPadTop)
        : str("heroLogoPadTop") || "0",
    heroLogoPadBottom:
      typeof raw.heroLogoPadBottom === "number"
        ? String(raw.heroLogoPadBottom)
        : str("heroLogoPadBottom") || "0",
    imageAlt: str("imageAlt"),
    ctaLabel: str("ctaLabel"),
    ctaAction: str("ctaAction") || "rsvp",
    emailSubject: str("emailSubject"),
    emailHeading: str("emailHeading"),
    emailBody: str("emailBody"),
  };
}

export function eventToFormValues(
  event: {
    name: string;
    tagline: string;
    summary: string;
    heroBody?: string;
    status: string;
    date: string;
    location: string;
    venue: string | null;
    tags: string[];
    genres: string[];
    tone: MediaTone;
    featured: boolean;
    published: boolean;
    rsvpEnabled?: boolean;
    ticketsEnabled?: boolean;
    ticketTiers?: Array<{
      id: string;
      name: string;
      priceCents: number;
      capacity: number;
      hidden?: boolean;
      soldOut?: boolean;
    }>;
    order: number;
    shotNote: string;
    image: string | null;
    heroLogo?: string | null;
    heroLogoSize?: "sm" | "md" | "lg";
    heroLogoPadTop?: number;
    heroLogoPadBottom?: number;
    imageAlt: string;
    ctaLabel: string;
    ctaAction: CtaAction;
    emailSubject: string | null;
    emailHeading: string | null;
    emailBody: string | null;
  },
  allowedGenres: readonly string[],
): EventFormValues {
  return {
    name: event.name,
    tagline: event.tagline,
    summary: event.summary,
    heroBody: event.heroBody ?? "",
    status: event.status,
    date: event.date,
    location: event.location,
    venue: event.venue ?? "",
    tags: event.tags.join(", "),
    genres: normaliseGenres(event.genres, allowedGenres),
    tone: event.tone,
    featured: event.featured,
    published: event.published,
    rsvpEnabled: event.rsvpEnabled !== false,
    ticketsEnabled: event.ticketsEnabled === true,
    tickets: (event.ticketTiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: priceToForm(tier.priceCents),
      capacity: String(tier.capacity),
      hidden: tier.hidden === true,
      soldOut: tier.soldOut === true,
    })),
    order: String(event.order),
    shotNote: event.shotNote,
    image: event.image ?? "",
    heroLogo: event.heroLogo ?? "",
    heroLogoSize: event.heroLogoSize ?? "md",
    heroLogoPadTop: String(event.heroLogoPadTop ?? 0),
    heroLogoPadBottom: String(event.heroLogoPadBottom ?? 0),
    imageAlt: event.imageAlt,
    ctaLabel: event.ctaLabel,
    ctaAction: event.ctaAction,
    emailSubject: event.emailSubject ?? "",
    emailHeading: event.emailHeading ?? "",
    emailBody: event.emailBody ?? "",
  };
}

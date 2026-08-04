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
  order: string;
  shotNote: string;
  image: string;
  heroLogo: string;
  heroLogoSize: string;
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
  order: "0",
  shotNote: "",
  image: "",
  heroLogo: "",
  heroLogoSize: "md",
  imageAlt: "",
  ctaLabel: "RSVP",
  ctaAction: "rsvp",
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

  if (values.ctaAction !== "rsvp" && values.ctaAction !== "partner") {
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
      "Upload a photo, or use a path inside /public such as /media/sun-club-01.jpg";
  }

  // Same rule as the photograph, same reason: the ref reaches an img src.
  if (!isValidImageRef(values.heroLogo)) {
    errors.heroLogo = "Upload a logo image, or use a path inside /public.";
  }

  if (!["sm", "md", "lg"].includes(values.heroLogoSize)) {
    errors.heroLogoSize = "Pick small, medium or large.";
  }

  return errors;
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
    order: Number(values.order),
    shotNote: values.shotNote.trim(),
    image: values.image.trim() || null,
    heroLogo: values.heroLogo.trim() || null,
    heroLogoSize: values.heroLogoSize as "sm" | "md" | "lg",
    imageAlt: values.imageAlt.trim(),
    ctaLabel: values.ctaLabel.trim(),
    ctaAction: values.ctaAction as CtaAction,
    // Blank means "use the standard wording", so store null rather than "".
    emailSubject: values.emailSubject.trim() || null,
    emailHeading: values.emailHeading.trim() || null,
    emailBody: values.emailBody.trim() || null,
  };
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
    order: typeof raw.order === "number" ? String(raw.order) : str("order") || "0",
    shotNote: str("shotNote"),
    image: str("image"),
    heroLogo: str("heroLogo"),
    heroLogoSize: str("heroLogoSize") || "md",
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
    order: number;
    shotNote: string;
    image: string | null;
    heroLogo?: string | null;
    heroLogoSize?: "sm" | "md" | "lg";
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
    order: String(event.order),
    shotNote: event.shotNote,
    image: event.image ?? "",
    heroLogo: event.heroLogo ?? "",
    heroLogoSize: event.heroLogoSize ?? "md",
    imageAlt: event.imageAlt,
    ctaLabel: event.ctaLabel,
    ctaAction: event.ctaAction,
    emailSubject: event.emailSubject ?? "",
    emailHeading: event.emailHeading ?? "",
    emailBody: event.emailBody ?? "",
  };
}

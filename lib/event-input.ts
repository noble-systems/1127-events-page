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
  series: string;
  tagline: string;
  summary: string;
  status: string;
  date: string;
  location: string;
  venue: string;
  tags: string;
  tone: string;
  featured: boolean;
  published: boolean;
  order: string;
  shotNote: string;
  image: string;
  imageAlt: string;
  ctaLabel: string;
  ctaAction: string;
};

export const EMPTY_EVENT: EventFormValues = {
  name: "",
  series: "1127 Events",
  tagline: "",
  summary: "",
  status: "Announcing Soon",
  date: "Dates Announcing Soon",
  location: "Old Town Scottsdale, Arizona",
  venue: "",
  tags: "",
  tone: "dusk",
  featured: false,
  published: false,
  order: "0",
  shotNote: "",
  image: "",
  imageAlt: "",
  ctaLabel: "RSVP",
  ctaAction: "rsvp",
};

const REQUIRED: Array<[keyof EventFormValues, string]> = [
  ["name", "Name"],
  ["series", "Series"],
  ["tagline", "Tagline"],
  ["summary", "Summary"],
  ["status", "Status badge"],
  ["date", "Date"],
  ["location", "Location"],
  ["imageAlt", "Image alt text"],
  ["ctaLabel", "Button label"],
];

const MAX: Partial<Record<keyof EventFormValues, number>> = {
  name: 120,
  series: 80,
  tagline: 160,
  summary: 600,
  status: 40,
  date: 80,
  location: 120,
  venue: 120,
  shotNote: 160,
  imageAlt: 200,
  ctaLabel: 60,
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

  // Must be a single-slash local path. Rejecting a leading "//" matters:
  // "//evil.example/x.jpg" is a protocol-relative URL, not a local file. ".."
  // is refused so the path can't climb out of /public.
  const image = values.image.trim();
  if (image && (!/^\/(?!\/)[\w\-./]+$/.test(image) || image.includes(".."))) {
    errors.image = "Use a path inside /public, e.g. /media/sun-club-01.jpg";
  }

  return errors;
}

/** Assumes `validateEvent` already passed. */
export function toEventInput(id: string, values: EventFormValues): NewEventInput {
  return {
    id,
    name: values.name.trim(),
    series: values.series.trim(),
    tagline: values.tagline.trim(),
    summary: values.summary.trim(),
    status: values.status.trim(),
    date: values.date.trim(),
    location: values.location.trim(),
    venue: values.venue.trim() || null,
    tags: values.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8),
    tone: values.tone as MediaTone,
    featured: Boolean(values.featured),
    published: Boolean(values.published),
    order: Number(values.order),
    shotNote: values.shotNote.trim(),
    image: values.image.trim() || null,
    imageAlt: values.imageAlt.trim(),
    ctaLabel: values.ctaLabel.trim(),
    ctaAction: values.ctaAction as CtaAction,
  };
}

/** Normalises an unknown JSON body into form values. */
export function readEventBody(body: unknown): EventFormValues {
  const raw = (body ?? {}) as Record<string, unknown>;
  const str = (key: keyof EventFormValues) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";

  return {
    name: str("name"),
    series: str("series") || "1127 Events",
    tagline: str("tagline"),
    summary: str("summary"),
    status: str("status"),
    date: str("date"),
    location: str("location"),
    venue: str("venue"),
    tags: Array.isArray(raw.tags) ? raw.tags.join(", ") : str("tags"),
    tone: str("tone") || "dusk",
    featured: raw.featured === true || raw.featured === "true",
    published: raw.published === true || raw.published === "true",
    order: typeof raw.order === "number" ? String(raw.order) : str("order") || "0",
    shotNote: str("shotNote"),
    image: str("image"),
    imageAlt: str("imageAlt"),
    ctaLabel: str("ctaLabel"),
    ctaAction: str("ctaAction") || "rsvp",
  };
}

export function eventToFormValues(event: {
  name: string;
  series: string;
  tagline: string;
  summary: string;
  status: string;
  date: string;
  location: string;
  venue: string | null;
  tags: string[];
  tone: MediaTone;
  featured: boolean;
  published: boolean;
  order: number;
  shotNote: string;
  image: string | null;
  imageAlt: string;
  ctaLabel: string;
  ctaAction: CtaAction;
}): EventFormValues {
  return {
    name: event.name,
    series: event.series,
    tagline: event.tagline,
    summary: event.summary,
    status: event.status,
    date: event.date,
    location: event.location,
    venue: event.venue ?? "",
    tags: event.tags.join(", "),
    tone: event.tone,
    featured: event.featured,
    published: event.published,
    order: String(event.order),
    shotNote: event.shotNote,
    image: event.image ?? "",
    imageAlt: event.imageAlt,
    ctaLabel: event.ctaLabel,
    ctaAction: event.ctaAction,
  };
}

/**
 * Every field on the homepage that the dashboard can edit.
 *
 * This list is the single source of truth. The store validates against it, the
 * admin page renders itself from it, and the merge into content/site.ts walks
 * it. Adding a newly editable field means adding one entry here and nothing
 * else.
 *
 * Keys are dot paths into the content object, with numeric segments indexing
 * arrays: "mediaSlots.0.image". They are matched against this list on write, so
 * a crafted key cannot set an arbitrary path.
 *
 * content/site.ts remains the default for every field. An override is stored
 * only when somebody actually changes something, which means the site still
 * renders correctly if the store is empty, unreachable, or wiped.
 */

export type FieldKind =
  | "text"
  /** Multi-line prose. Blank lines separate paragraphs where the section renders them that way. */
  | "textarea"
  /** One item per line, stored as an array. */
  | "list"
  /** An image reference: "s3:key" from an upload, or a path under /public. */
  | "image";

export type ContentField = {
  /** Dot path into the content object. */
  key: string;
  label: string;
  kind: FieldKind;
  /** Shown under the input. */
  hint?: string;
  /** Alt text belongs with its image, so the editor can group them. */
  altFor?: string;
};

export type ContentGroup = {
  id: string;
  title: string;
  /** What a person sees on the page, so it is findable without guessing. */
  description: string;
  fields: ContentField[];
};

/** The eight tiles in the media grid, in the order they appear. */
const MEDIA_SLOT_IDS = [
  "crowd",
  "dj",
  "friends",
  "venue",
  "drinks",
  "golden-hour",
  "production",
  "recap",
] as const;

const mediaSlotFields = (): ContentField[] =>
  MEDIA_SLOT_IDS.flatMap((id, index) => [
    {
      key: `mediaSlots.${index}.image`,
      label: `Tile ${index + 1} (${id})`,
      kind: "image" as const,
    },
    {
      key: `mediaSlots.${index}.imageAlt`,
      label: `Tile ${index + 1} description`,
      kind: "text" as const,
      hint: "Describes the photo for screen readers and for search engines.",
      altFor: `mediaSlots.${index}.image`,
    },
  ]);

export const CONTENT_GROUPS: ContentGroup[] = [
  {
    id: "hero",
    title: "Hero",
    description:
      "The full-height block at the very top of the homepage: the headline event and its photograph.",
    fields: [
      { key: "hero.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "hero.title", label: "Title", kind: "text" },
      { key: "hero.tagline", label: "Tagline", kind: "text" },
      { key: "hero.body", label: "Body", kind: "textarea" },
      { key: "hero.location", label: "Location", kind: "text" },
      {
        key: "hero.date",
        label: "Date",
        kind: "text",
        hint: 'Free text. "Dates Announcing Soon" is as valid as a real date.',
      },
      { key: "hero.image", label: "Background photograph", kind: "image" },
      {
        key: "hero.imageAlt",
        label: "Photograph description",
        kind: "text",
        altFor: "hero.image",
      },
    ],
  },
  {
    id: "sunClub",
    title: "Sun Club intro",
    description: "The section introducing the series, below the events.",
    fields: [
      { key: "sunClub.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "sunClub.title", label: "Title", kind: "text" },
      {
        key: "sunClub.paragraphs",
        label: "Paragraphs",
        kind: "list",
        hint: "One paragraph per line.",
      },
      { key: "sunClub.image", label: "Photograph", kind: "image" },
      {
        key: "sunClub.imageAlt",
        label: "Photograph description",
        kind: "text",
        altFor: "sunClub.image",
      },
    ],
  },
  {
    id: "ambassadors",
    title: "Ambassadors",
    description: "The ambassador programme section and its application form.",
    fields: [
      { key: "ambassadors.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "ambassadors.title", label: "Title", kind: "text" },
      { key: "ambassadors.intro", label: "Intro", kind: "textarea" },
      { key: "ambassadors.cta", label: "Button label", kind: "text" },
      { key: "ambassadors.image", label: "Photograph", kind: "image" },
      {
        key: "ambassadors.imageAlt",
        label: "Photograph description",
        kind: "text",
        altFor: "ambassadors.image",
      },
    ],
  },
  {
    id: "media",
    title: "Photo grid",
    description:
      "The wall of images. Each tile falls back to a designed gradient until a photograph is set, so an empty tile never looks broken.",
    fields: [
      { key: "mediaSection.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "mediaSection.title", label: "Title", kind: "text" },
      { key: "mediaSection.intro", label: "Intro", kind: "textarea" },
      ...mediaSlotFields(),
    ],
  },
  {
    id: "partner",
    title: "Partner",
    description: "The section aimed at venues and sponsors.",
    fields: [
      { key: "partner.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "partner.title", label: "Title", kind: "text" },
      { key: "partner.intro", label: "Intro", kind: "textarea" },
      { key: "partner.cta", label: "Button label", kind: "text" },
    ],
  },
  {
    id: "finalCta",
    title: "Closing call to action",
    description: "The two-column block at the foot of the page.",
    fields: [
      { key: "finalCta.guests.eyebrow", label: "Guests: eyebrow", kind: "text" },
      { key: "finalCta.guests.title", label: "Guests: title", kind: "text" },
      { key: "finalCta.guests.body", label: "Guests: body", kind: "textarea" },
      { key: "finalCta.guests.cta", label: "Guests: button", kind: "text" },
      {
        key: "finalCta.partners.eyebrow",
        label: "Partners: eyebrow",
        kind: "text",
      },
      { key: "finalCta.partners.title", label: "Partners: title", kind: "text" },
      { key: "finalCta.partners.body", label: "Partners: body", kind: "textarea" },
      { key: "finalCta.partners.cta", label: "Partners: button", kind: "text" },
    ],
  },
];

/** Flat lookup, so a write can check a key is one we actually publish. */
export const CONTENT_FIELDS: ReadonlyMap<string, ContentField> = new Map(
  CONTENT_GROUPS.flatMap((group) => group.fields.map((f) => [f.key, f])),
);

export function isEditableKey(key: string): boolean {
  return CONTENT_FIELDS.has(key);
}

/** Every image field, which the admin page renders with an uploader. */
export function imageKeys(): string[] {
  return [...CONTENT_FIELDS.values()]
    .filter((f) => f.kind === "image")
    .map((f) => f.key);
}

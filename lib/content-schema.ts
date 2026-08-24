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
  | "image"
  /**
   * Two-column rows, one per line, written "Label: value".
   *
   * The details table and the partner list are arrays of objects rather than
   * strings, and leaving them out was why a whole block of the page could not
   * be touched. A colon is the separator because it is what the rows already
   * look like on screen.
   */
  | "pairs";

export type ContentField = {
  /** Dot path into the content object. */
  key: string;
  label: string;
  kind: FieldKind;
  /** Shown under the input. */
  hint?: string;
  /** Alt text belongs with its image, so the editor can group them. */
  altFor?: string;
  /** For "pairs": the two property names each row maps to. */
  pairKeys?: [string, string];
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

/**
 * ARCHIVED with the media grid section; see components/sections/MediaGrid.tsx.
 * Restoring the section means re-adding a "media" group whose fields come from
 * this builder, which is why it stays rather than moving to git history.
 */
const _archivedMediaSlotFields = (): ContentField[] =>
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
      "The full-height block at the top of the homepage. Its name, tagline, paragraph, date, location and photograph all come from whichever event is marked Featured, so edit those on the event. Only the three button labels are set here. The line above the name is always \"1127 Events Presents\" and is not editable.",
    fields: [
      { key: "hero.image", label: "Homepage backdrop", kind: "image" },
      {
        key: "hero.imageAlt",
        label: "Backdrop alt text",
        kind: "text",
        altFor: "hero.image",
      },
      { key: "hero.primaryCta.label", label: "First button", kind: "text" },
      { key: "hero.secondaryCta.label", label: "Second button", kind: "text" },
      { key: "hero.rsvpCta", label: "Third button", kind: "text" },
    ],
  },
  {
    id: "upcoming",
    title: "Upcoming events",
    description:
      "The heading above the event cards. The cards themselves come from Events.",
    fields: [
      { key: "upcoming.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "upcoming.title", label: "Title", kind: "text" },
      { key: "upcoming.intro", label: "Intro", kind: "textarea" },
      {
        key: "facts",
        label: "Facts strip",
        kind: "pairs",
        pairKeys: ["value", "label"],
        hint: 'One per line, written "Figure: what it means". Only claims that are actually true: the combined-experience number is the one hard figure the site asserts.',
      },
    ],
  },
  {
    id: "ambassadors",
    title: "Ambassadors",
    description: "The ambassador programme section and its application form.",
    fields: [
      { key: "ambassadors.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "ambassadors.doTitle", label: "List 1 heading", kind: "text" },
      {
        key: "ambassadors.does",
        label: "What ambassadors do",
        kind: "list",
        hint: "One per line.",
      },
      { key: "ambassadors.forTitle", label: "List 2 heading", kind: "text" },
      {
        key: "ambassadors.communities",
        label: "Who it's for",
        kind: "list",
        hint: "One per line.",
      },
      {
        key: "ambassadors.benefitsTitle",
        label: "List 3 heading",
        kind: "text",
      },
      {
        key: "ambassadors.benefits",
        label: "What you get",
        kind: "list",
        hint: "One per line.",
      },
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
    id: "partner",
    title: "Partner",
    description: "The section aimed at venues and sponsors.",
    fields: [
      { key: "partner.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "partner.title", label: "Title", kind: "text" },
      { key: "partner.intro", label: "Intro", kind: "textarea" },
      { key: "partner.cta", label: "Button label", kind: "text" },
      {
        key: "partner.brings",
        label: "What 1127 brings",
        kind: "pairs",
        pairKeys: ["title", "body"],
        hint: 'One per line, written "Title: description".',
      },
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

/**
 * Event photography, stored in S3 so a picture can be replaced without a deploy.
 *
 * An image reference is stored in one of two forms:
 *
 *   "/media/sun-club-01.jpg"        a file committed under /public
 *   "s3:events/sun-club/hero.jpg"   an object key in the images bucket
 *
 * The `s3:` form stores the KEY rather than a full URL, on purpose. A stored URL
 * bakes in the bucket name and the region, so moving buckets or regions later
 * would mean rewriting every row. Storing the key makes that a config change.
 * It also means the validator never has to decide whether an arbitrary
 * hostname is acceptable: anything with the s3: prefix resolves against our own
 * bucket and nothing else, so a crafted value cannot point the site at a
 * third-party host.
 *
 * These helpers are pure so they can be tested without AWS or a browser.
 */

export const S3_PREFIX = "s3:";

/**
 * Public base URL of the images bucket, e.g.
 * https://1127-events-images-769194516210.s3.us-west-2.amazonaws.com
 *
 * NEXT_PUBLIC_ so the dashboard can build a preview URL after an upload. This
 * is not a secret: the bucket serves these objects publicly by design.
 */
export function imagesBaseUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? process.env.IMAGES_BASE_URL;
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

/** True when the reference points at the images bucket rather than /public. */
export function isS3Ref(value: string): boolean {
  return value.startsWith(S3_PREFIX);
}

/** The object key inside the bucket, without the s3: prefix. */
export function s3Key(value: string): string {
  return isS3Ref(value) ? value.slice(S3_PREFIX.length) : value;
}

/**
 * Keys we are willing to write or read.
 *
 * Deliberately strict. Forward slashes are allowed so photographs can be
 * grouped per event, but a leading slash, a trailing slash, any "..", a
 * backslash, or a control character is refused. The failure this prevents is a
 * key that escapes its intended prefix or that renders as something other than
 * what was uploaded.
 */
export function isValidS3Key(key: string): boolean {
  if (!key || key.length > 256) return false;
  if (key.startsWith("/") || key.endsWith("/")) return false;
  if (key.includes("..") || key.includes("//") || key.includes("\\")) return false;
  if (!/^[a-zA-Z0-9!_.*'()/-]+$/.test(key)) return false;
  // Must look like an image, so a stray .html or .svg cannot be served from our
  // domain as though we published it. SVG is excluded on purpose: it can carry
  // script, and these are photographs.
  return /\.(jpe?g|png|webp|avif)$/i.test(key);
}

/** A local file committed under /public. */
export function isValidLocalPath(value: string): boolean {
  // Single leading slash only. "//evil.example/x.jpg" is a protocol-relative
  // URL, not a local file, and would load a third-party image.
  return /^\/(?!\/)[\w\-./]+$/.test(value) && !value.includes("..");
}

/** Whether a stored image reference is one we accept. */
export function isValidImageRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true; // empty means "no photograph yet", which is fine
  return isS3Ref(trimmed)
    ? isValidS3Key(s3Key(trimmed))
    : isValidLocalPath(trimmed);
}

/**
 * Turns a stored reference into something an <img> can load.
 *
 * Returns null rather than a broken URL when an s3: reference cannot be
 * resolved, which makes the component fall back to its designed gradient
 * placeholder instead of rendering a broken image icon.
 */
export function resolveImageSrc(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (!isS3Ref(trimmed)) return isValidLocalPath(trimmed) ? trimmed : null;

  const key = s3Key(trimmed);
  if (!isValidS3Key(key)) return null;

  const base = imagesBaseUrl();
  if (!base) return null;

  return `${base}/${key}`;
}

/**
 * Stable key for an event photograph.
 *
 * Stable is the point: uploading a new file to the same key replaces the
 * picture everywhere it appears, with no database change. That is what makes
 * these swappable. The tradeoff is caching, which is why the upload route sets
 * a short max-age on these objects.
 */
/**
 * Stable key for a homepage photograph, derived from its content field.
 *
 * "hero.image" becomes "site/hero-image.jpg". Stable for the same reason event
 * keys are: re-uploading replaces the picture wherever it appears, with no
 * content change needed.
 */
export function siteImageKey(fieldKey: string, filename: string): string {
  const extension = (filename.match(/\.(jpe?g|png|webp|avif)$/i)?.[1] ?? "jpg")
    .toLowerCase()
    .replace("jpeg", "jpg");
  const safe = fieldKey.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `site/${safe || "image"}.${extension}`;
}

export function eventImageKey(eventId: string, filename: string): string {
  const extension = (filename.match(/\.(jpe?g|png|webp|avif)$/i)?.[1] ?? "jpg")
    .toLowerCase()
    .replace("jpeg", "jpg");
  const safeId = eventId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 60) || "event";
  return `events/${safeId}/hero.${extension}`;
}

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { S3_PREFIX, eventImageKey, isValidS3Key, siteImageKey } from "@/lib/images";
import { isEditableKey } from "@/lib/content-schema";

/**
 * POST /api/admin/uploads
 *
 *   { eventId,    filename, contentType } → { url, ref, key }   event photo
 *   { contentKey, filename, contentType } → { url, ref, key }   homepage photo
 *
 * Hands back a short-lived presigned PUT URL so the browser uploads the file
 * straight to S3. The bytes never pass through this app, which matters: Lambda
 * request bodies are capped at a few megabytes and a photograph off a real
 * camera will exceed that.
 *
 * `ref` is what gets stored on the event ("s3:events/<id>/hero.jpg"), not a full
 * URL. See lib/images.ts for why.
 */

const BUCKET = () => process.env.IMAGES_BUCKET?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-2";

/** Only real photograph formats. Deliberately excludes SVG, which can carry script. */
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) client = new S3Client({ region: region() });
  return client;
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const bucket = BUCKET();
  if (!bucket) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Image uploads are not configured. Set IMAGES_BUCKET from the stack outputs.",
      },
      { status: 503 },
    );
  }

  const body = (await readJson(request)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const contentKey = typeof body?.contentKey === "string" ? body.contentKey : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";

  // The client also sends `filename`, and it is deliberately not read. A
  // filename is attacker-controlled, and deriving a storage key from one is how
  // you end up writing "../index.html" or serving something unexpected from your
  // own domain. The extension comes from the content type allow-list instead.

  if (!eventId.trim() && !contentKey.trim()) {
    return NextResponse.json(
      { ok: false, message: "Save the event first, then add a photo." },
      { status: 400 },
    );
  }

  // A content key must name a real image field. Without this check the key
  // would be attacker-chosen, and the whole point of deriving keys server side
  // is that they are not.
  if (contentKey && !isEditableKey(contentKey)) {
    return NextResponse.json(
      { ok: false, message: `"${contentKey}" is not an editable image field.` },
      { status: 400 },
    );
  }

const CACHE_FOREVER = "public, max-age=31536000, immutable";


  // Base36 time: compact, key-safe, and strictly increasing, so every upload
  // gets a URL no cache has ever seen.
  const version = Date.now().toString(36);
  const extension = ALLOWED.get(contentType.toLowerCase());
  if (!extension) {
    return NextResponse.json(
      {
        ok: false,
        message: "Use a JPEG, PNG, WebP or AVIF image.",
      },
      { status: 400 },
    );
  }

  // The key is derived from the event id and the content type, never from the
  // uploaded filename. A filename is attacker-controlled; deriving the key from
  // it is how you end up serving something unexpected from your own domain.
  const key = contentKey
    ? siteImageKey(contentKey, `x.${extension}`, version)
    : eventImageKey(eventId, `x.${extension}`, version);

  if (!isValidS3Key(key)) {
    // Should be unreachable, since eventImageKey sanitises. Belt and braces:
    // this is the check that stands between a request and a write.
    console.error("[1127] refusing to sign an invalid key", key);
    return NextResponse.json(
      { ok: false, message: "Could not build a safe filename for that upload." },
      { status: 400 },
    );
  }

  try {
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        // The key is versioned per upload, so this URL's bytes can never
        // change and every cache in the chain may keep them for a year.
        // Replacing the photo replaces the URL, which is what actually makes
        // an update appear: the old "stable key + short max-age" approach
        // still left the browser, the CDN and the image optimizer each
        // serving the old bytes until their own clocks ran out.
        CacheControl: CACHE_FOREVER,
      }),
      // Long enough to upload a large photo on a poor connection, short
      // enough that a leaked URL is not a lasting write capability.
      //
      // Cache-Control only becomes object metadata when the PUT itself sends
      // the header, which is why the response tells the client the exact value
      // to send. The presigner hoists it into the query string either way, so
      // a headerless PUT still succeeds; it merely lands without the policy,
      // which is harmless, since freshness comes from the versioned key rather
      // than from headers. Verified against the real bucket both ways.
      { expiresIn: 300 },
    );

    return NextResponse.json({
      ok: true,
      // The PUT should send this exact header; see the presign note above.
      cacheControl: CACHE_FOREVER,
      url,
      key,
      ref: `${S3_PREFIX}${key}`,
      contentType,
    });
  } catch (error) {
    console.error("[1127] could not presign an upload", error);
    return NextResponse.json(
      { ok: false, message: "Could not start that upload. Please try again." },
      { status: 502 },
    );
  }
}

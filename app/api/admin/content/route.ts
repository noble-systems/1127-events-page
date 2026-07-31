import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { CONTENT_FIELDS, isEditableKey } from "@/lib/content-schema";
import { isValidImageRef } from "@/lib/images";
import { normaliseValue } from "@/lib/site-content";
import { getContentOverrides, saveContentOverrides } from "@/lib/store";

/**
 * GET  /api/admin/content  → the stored overrides
 * PUT  /api/admin/content  → replace them
 *
 * The body is a flat map of dot path to value. Anything not named in
 * lib/content-schema.ts is rejected rather than ignored: silently dropping a key
 * would look like a save that worked, and the person would go looking for their
 * edit on the live site.
 */

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ ok: true, overrides: await getContentOverrides() });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, message: "That didn't look like a content update." },
      { status: 400 },
    );
  }

  const overrides: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(body)) {
    if (!isEditableKey(key)) {
      errors[key] = "Not an editable field.";
      continue;
    }

    const field = CONTENT_FIELDS.get(key);
    if (!field) continue;

    // pairKeys matters: partner.brings stores title/body, the details table
    // stores label/value, and normalising without it would rename the
    // properties the section reads.
    const value = normaliseValue(field.kind, raw, field.pairKeys);

    // null means "no override": the field falls back to the committed default.
    // That is how a field gets reset, so it is stored as an absence.
    if (value === null) continue;

    if (field.kind === "image" && typeof value === "string") {
      // Same rule the event form uses. Without it, a crafted value could point
      // the homepage at an image on somebody else's host.
      if (!isValidImageRef(value)) {
        errors[key] = "Upload a photo, or use a path inside /public.";
        continue;
      }
    }

    overrides[key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { ok: false, errors, message: "Some fields could not be saved." },
      { status: 400 },
    );
  }

  try {
    await saveContentOverrides(overrides);
  } catch (error) {
    console.error("[1127] could not save content", error);
    return NextResponse.json(
      { ok: false, message: "Couldn't save that. Please try again." },
      { status: 502 },
    );
  }

  // The homepage is cached for 60s; without this a save would appear to do
  // nothing for up to a minute and get saved again.
  revalidatePath("/");

  return NextResponse.json({ ok: true, saved: Object.keys(overrides).length });
}

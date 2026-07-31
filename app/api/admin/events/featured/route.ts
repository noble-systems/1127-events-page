import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { setFeaturedEvent } from "@/lib/store";

/**
 * PUT /api/admin/events/featured  { id: string | null }
 *
 * Featured is one slot shared by every event, not a property of each, so it is
 * set here rather than through the event form. Sending `null` clears it.
 *
 * A dedicated route because the event PUT takes a whole event: posting a
 * partial body to it would fill every missing field with a default and quietly
 * blank the record.
 */
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { id?: unknown } | null;
  const id = body?.id;

  if (id !== null && typeof id !== "string") {
    return NextResponse.json(
      { ok: false, message: "Send an event id, or null to clear it." },
      { status: 400 },
    );
  }

  // Refuses drafts and unknown ids; see setFeaturedEvent.
  await setFeaturedEvent(id);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}

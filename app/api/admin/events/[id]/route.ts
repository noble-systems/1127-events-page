import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  isValidEventId,
  readEventBody,
  toEventInput,
  validateEvent,
} from "@/lib/event-input";
import {
  deleteEvent,
  getEvent,
  getGenreList,
  renameEvent,
  updateEvent,
} from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    return NextResponse.json(
      { ok: false, message: "Event not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, event });
}

export async function PUT(request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await getEvent(id);

  if (!existing) {
    return NextResponse.json(
      { ok: false, message: "Event not found." },
      { status: 404 },
    );
  }
  // The live genre list, so a genre an admin created is not silently
  // discarded on save. See normaliseGenres.
  const allowedGenres = await getGenreList();

  const body = await readJson(request);
  const values = readEventBody(body, allowedGenres);
  const errors = validateEvent(values);

  /**
   * An optional new URL for the event. Checked here rather than in
   * validateEvent because uniqueness needs the store. The old URL is not
   * lost: renameEvent keeps it as a permanent redirect.
   */
  const rawNewId =
    typeof (body as { newId?: unknown })?.newId === "string"
      ? ((body as { newId: string }).newId ?? "").trim()
      : "";
  const newId = rawNewId && rawNewId !== id ? rawNewId : null;
  if (newId) {
    if (!isValidEventId(newId)) {
      errors.newId = "Use lowercase letters, numbers and hyphens only.";
    } else if (await getEvent(newId)) {
      errors.newId = "Another event already uses this URL.";
    } else {
      // Former ids of OTHER events are redirects in the wild; taking one
      // would hijack their old links.
      const { listAllEvents } = await import("@/lib/store");
      const all = await listAllEvents();
      const shadowed = all.some(
        (row) => row.id !== id && (row.formerIds ?? []).includes(newId),
      );
      if (shadowed) errors.newId = "That URL is a former address of another event.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { ok: false, errors, message: "Please check the highlighted fields." },
      { status: 400 },
    );
  }

  let event = await updateEvent(
    existing,
    toEventInput(id, values, allowedGenres),
  );
  if (newId) event = await renameEvent(event, newId);
  revalidatePath("/");

  return NextResponse.json({ ok: true, event });
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await getEvent(id);

  if (!existing) {
    return NextResponse.json(
      { ok: false, message: "Event not found." },
      { status: 404 },
    );
  }

  await deleteEvent(id);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}

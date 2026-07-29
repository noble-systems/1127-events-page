import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { readEventBody, toEventInput, validateEvent } from "@/lib/event-input";
import { deleteEvent, getEvent, updateEvent } from "@/lib/store";

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

  const values = readEventBody(await readJson(request));
  const errors = validateEvent(values);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { ok: false, errors, message: "Please check the highlighted fields." },
      { status: 400 },
    );
  }

  const event = await updateEvent(existing, toEventInput(id, values));
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

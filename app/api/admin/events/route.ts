import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  readEventBody,
  slugify,
  toEventInput,
  validateEvent,
} from "@/lib/event-input";
import { createEvent, listAllEvents } from "@/lib/store";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const events = await listAllEvents();
  return NextResponse.json({ ok: true, events });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const values = readEventBody(await readJson(request));
  const errors = validateEvent(values);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { ok: false, errors, message: "Please check the highlighted fields." },
      { status: 400 },
    );
  }

  // Slugs double as the DynamoDB key, so make sure it's free.
  const existing = await listAllEvents();
  const taken = new Set(existing.map((event) => event.id));
  const base = slugify(values.name);
  let id = base;
  let suffix = 2;
  while (taken.has(id)) id = `${base}-${suffix++}`;

  const event = await createEvent(toEventInput(id, values));
  revalidatePath("/");

  return NextResponse.json({ ok: true, event }, { status: 201 });
}

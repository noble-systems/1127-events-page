import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  createTrackLink,
  deleteTrackLink,
  getTrackLink,
  isValidTrackId,
  listTrackLinks,
  renameTrackLink,
} from "@/lib/track-links";

/**
 * Tracking links, admin only.
 *
 *   GET               the list
 *   POST   {label}    mint a link for one posting spot
 *   PATCH  {id, label}  fix the label
 *   DELETE {id}       remove it; sales already attributed keep their id
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, links: await listTrackLinks() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Say where this link will be posted." },
      { status: 400 },
    );
  }

  const link = await createTrackLink(label);
  return NextResponse.json({ ok: true, link });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    id?: unknown;
    label?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id.toLowerCase() : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!isValidTrackId(id) || !label || label.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Say which link, and its new label." },
      { status: 400 },
    );
  }
  if (!(await getTrackLink(id))) {
    return NextResponse.json(
      { ok: false, message: "That link does not exist." },
      { status: 404 },
    );
  }

  await renameTrackLink(id, label);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.toLowerCase() : "";
  if (!isValidTrackId(id)) {
    return NextResponse.json(
      { ok: false, message: "Say which link to remove." },
      { status: 400 },
    );
  }

  await deleteTrackLink(id);
  return NextResponse.json({ ok: true });
}

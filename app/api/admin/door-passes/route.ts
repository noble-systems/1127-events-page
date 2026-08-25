import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  createDoorPass,
  listDoorPasses,
  patchDoorPass,
} from "@/lib/door-store";

/**
 * Door passes, admin only.
 *
 *   GET                      the roster, PINs included (they get handed out
 *                            at call time; this page is behind the admin login)
 *   POST  {label}            mint a pass
 *   PATCH {id, action}       "revoke" signs out every phone using the pass
 *                            (the PIN keeps working for a fresh login);
 *                            "deactivate" kills PIN and sessions both;
 *                            "activate" turns it back on
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, passes: await listDoorPasses() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 60) {
    return NextResponse.json(
      { ok: false, message: "Give the pass a name: whose phone is this?" },
      { status: 400 },
    );
  }

  const pass = await createDoorPass(label);
  return NextResponse.json({ ok: true, pass });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    id?: unknown;
    action?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;

  if (!id || !["revoke", "deactivate", "activate"].includes(action as string)) {
    return NextResponse.json(
      { ok: false, message: "Say which pass, and what to do with it." },
      { status: 400 },
    );
  }

  try {
    if (action === "revoke") {
      await patchDoorPass(id, { revokedAfter: Date.now() });
    }
    if (action === "deactivate") {
      await patchDoorPass(id, { active: false, revokedAfter: Date.now() });
    }
    if (action === "activate") await patchDoorPass(id, { active: true });
  } catch (error) {
    console.error("[1127] door pass change failed", error);
    const detail =
      error instanceof Error ? ` (${error.name}: ${error.message.slice(0, 120)})` : "";
    return NextResponse.json(
      { ok: false, message: `That change didn't stick.${detail}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

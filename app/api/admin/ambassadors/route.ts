import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  isValidAmbassadorCode,
  normalizeAmbassadorCode,
} from "@/lib/ambassadors";
import {
  createAmbassador,
  listAmbassadors,
  setAmbassadorActive,
} from "@/lib/ambassadors-store";

/**
 * Ambassador codes, admin only.
 *
 *   GET             the list
 *   POST  {name, code}         mint a code
 *   PATCH {code, active}       switch attribution on or off
 *
 * There is deliberately no DELETE: a code that ever attributed anything is
 * part of the payout history, and deactivating stops the future without
 * rewriting the past.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, ambassadors: await listAmbassadors() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    name?: unknown;
    code?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const code = normalizeAmbassadorCode(
    typeof body?.code === "string" ? body.code : "",
  );

  if (!name || name.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Give the ambassador a name." },
      { status: 400 },
    );
  }
  if (!isValidAmbassadorCode(code)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Codes are 3 to 20 characters: letters, numbers and hyphens.",
      },
      { status: 400 },
    );
  }

  const created = await createAmbassador({
    code,
    name,
    active: true,
    createdAt: new Date().toISOString(),
  });
  if (!created) {
    return NextResponse.json(
      { ok: false, message: "That code is already taken." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    code?: unknown;
    active?: unknown;
  } | null;
  const code = normalizeAmbassadorCode(
    typeof body?.code === "string" ? body.code : "",
  );
  if (!isValidAmbassadorCode(code) || typeof body?.active !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "Say which code, and on or off." },
      { status: 400 },
    );
  }

  await setAmbassadorActive(code, body.active);
  return NextResponse.json({ ok: true });
}

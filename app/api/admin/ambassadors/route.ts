import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  isValidAmbassadorCode,
  normalizeAmbassadorCode,
} from "@/lib/ambassadors";
import {
  createAmbassador,
  listAmbassadors,
  patchAmbassador,
  setAmbassadorActive,
  setRewardEvery,
  setRewardTierName,
} from "@/lib/ambassadors-store";
import { renameAmbassador } from "@/lib/ambassador-admin";

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
    email?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = normalizeAmbassadorCode(
    typeof body?.code === "string" ? body.code : "",
  );

  if (!name || name.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Give the ambassador a name." },
      { status: 400 },
    );
  }
  // Required, because the reward system sends their free tickets here.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Give the ambassador an email for their free tickets." },
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
    email,
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
    newCode?: unknown;
    email?: unknown;
    rewardEvery?: unknown;
    rewardTierName?: unknown;
  } | null;
  const code = normalizeAmbassadorCode(
    typeof body?.code === "string" ? body.code : "",
  );

  // Reward setting: how many sales earn a free ticket. Site-wide, not
  // per-code.
  if (typeof body?.rewardEvery === "number") {
    const every = Math.floor(body.rewardEvery);
    if (every < 1 || every > 100) {
      return NextResponse.json(
        { ok: false, message: "Free-ticket threshold is 1 to 100 sales." },
        { status: 400 },
      );
    }
    await setRewardEvery(every);
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.rewardTierName === "string") {
    const tierName = body.rewardTierName.trim().slice(0, 60);
    await setRewardTierName(tierName);
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.newCode === "string") {
    const renamed = await renameAmbassador(
      code,
      normalizeAmbassadorCode(body.newCode),
    );
    if (!renamed.ok) {
      return NextResponse.json(
        { ok: false, message: renamed.reason },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, message: "That email doesn't look right." },
        { status: 400 },
      );
    }
    await patchAmbassador(code, { email });
    return NextResponse.json({ ok: true });
  }

  if (!isValidAmbassadorCode(code) || typeof body?.active !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "Say which code, and what to change." },
      { status: 400 },
    );
  }

  await setAmbassadorActive(code, body.active);
  return NextResponse.json({ ok: true });
}

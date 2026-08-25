import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { currentDoorPass } from "@/lib/door-auth";
import { runDoorCheck } from "@/lib/door-check";
import { patchDoorPass } from "@/lib/door-store";

/**
 * POST /api/door/check  { code }
 *
 * The scan itself. Two kinds of standing open it: a door pass (verified
 * against the store on EVERY call, which is what makes revocation instant),
 * or an admin session, so the boss can always work the line.
 */
export async function POST(request: Request) {
  const pass = await currentDoorPass();
  if (!pass) {
    const denied = await requireAdmin();
    if (denied) {
      return NextResponse.json(
        { ok: false, message: "Sign in at /door first." },
        { status: 401 },
      );
    }
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const { status, body: out } = await runDoorCheck(
    typeof body?.code === "string" ? body.code : "",
  );

  if (pass) {
    void patchDoorPass(pass.id, { lastUsedAt: new Date().toISOString() });
  }

  return NextResponse.json(out, { status });
}

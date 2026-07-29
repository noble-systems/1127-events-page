import { NextResponse } from "next/server";
import { readJson } from "@/lib/admin-api";
import { completeNewPassword, signIn, startSession } from "@/lib/auth";

/**
 * POST /api/admin/auth/login
 *
 *   { email, password }                     → sign in
 *   { email, newPassword, session }         → complete Cognito's forced
 *                                             password change for a new user
 */
export async function POST(request: Request) {
  const body = (await readJson(request)) as Record<string, unknown> | null;

  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const session = typeof body?.session === "string" ? body.session : "";

  if (!email.trim()) {
    return NextResponse.json(
      { ok: false, message: "Enter your email address." },
      { status: 400 },
    );
  }

  const result =
    newPassword && session
      ? await completeNewPassword(email, newPassword, session)
      : await signIn(email, password);

  if (result.status === "new-password-required") {
    return NextResponse.json({
      ok: false,
      challenge: "NEW_PASSWORD_REQUIRED",
      session: result.session,
      message: "Choose a new password to finish setting up this account.",
    });
  }

  if (result.status === "error") {
    return NextResponse.json(
      { ok: false, message: result.message },
      { status: 401 },
    );
  }

  await startSession(result.token);
  return NextResponse.json({ ok: true });
}

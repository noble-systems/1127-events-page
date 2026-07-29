import { NextResponse } from "next/server";
import { readJson } from "@/lib/admin-api";
import { requestLoginCode, startSession, verifyLoginCode } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";

/**
 * POST /api/admin/auth/login
 *
 *   { email }                  → email a six-digit code, return a session
 *   { email, code, session }   → exchange the code for a signed-in cookie
 *
 * There is no password step. See lib/auth.ts.
 *
 * Both steps are rate limited, and more tightly than the public forms:
 *   - requesting a code sends a real email to a real member of staff, so it is
 *     an amplification vector as well as an enumeration one
 *   - submitting a code is a guess at six digits, so the number of guesses is
 *     the entire security margin
 *
 * Limits are keyed on IP *and* on the email address. IP alone lets one attacker
 * spread guesses across addresses; email alone lets a botnet hammer one
 * account. Neither key on its own is enough.
 */
export async function POST(request: Request) {
  const body = (await readJson(request)) as Record<string, unknown> | null;

  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const session = typeof body?.session === "string" ? body.session : "";

  const address = email.trim().toLowerCase();
  if (!address) {
    return NextResponse.json(
      { ok: false, message: "Enter your email address." },
      { status: 400 },
    );
  }

  const ip = clientIp(request.headers) ?? "unknown";
  const bucket = code ? "loginVerify" : "loginRequest";

  for (const key of [`ip:${ip}`, `email:${address}`]) {
    const throttle = await consume(bucket, key);
    if (!throttle.allowed) {
      return NextResponse.json(
        {
          ok: false,
          message: code
            ? "Too many attempts. Request a new code in a few minutes."
            : "Too many code requests. Try again in a few minutes.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(throttle.retryAfterSeconds) },
        },
      );
    }
  }

  /* Step two: a code was supplied. */
  if (code) {
    const result = await verifyLoginCode(address, code, session);

    if (result.status === "error") {
      return NextResponse.json(
        { ok: false, message: result.message, retryable: result.retryable },
        { status: 401 },
      );
    }

    await startSession(result.token);
    return NextResponse.json({ ok: true });
  }

  /* Step one: send a code. */
  const result = await requestLoginCode(address);

  if (result.status === "error") {
    return NextResponse.json(
      { ok: false, message: result.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    stage: "code-sent",
    session: result.session,
    destination: result.destination,
  });
}

import { NextResponse } from "next/server";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { suppressEmail } from "@/lib/store";
import { readUnsubscribeToken } from "@/lib/tokens";

/**
 * POST /api/unsubscribe
 *
 * Handles both the one-click unsubscribe that mail clients trigger from the
 * `List-Unsubscribe-Post` header (RFC 8058) and the button on /unsubscribe.
 *
 * The token is read from either the query string or a form body, because Gmail
 * and friends POST with `List-Unsubscribe=One-Click` as the body.
 */
export async function POST(request: Request) {
  // Unauthenticated and, on a valid token, a full scan of the submissions
  // table. The token cannot be forged, but nothing stopped an attacker calling
  // this endlessly with junk tokens.
  const throttle = await consume(
    "unsubscribe",
    clientIp(request.headers) ?? "unknown",
  );
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many requests. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      },
    );
  }

  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";

  if (!token) {
    try {
      const form = await request.formData();
      token = String(form.get("token") ?? "");
    } catch {
      /* no body; fall through to the empty-token branch */
    }
  }

  const email = token ? readUnsubscribeToken(token) : null;

  if (!email) {
    return NextResponse.json(
      { ok: false, message: "That unsubscribe link isn't valid." },
      { status: 400 },
    );
  }

  try {
    // Suppress rather than delete.
    //
    // This used to remove every row for the address, which threw away three
    // things at once: the RSVP history, any application they had submitted, and
    // the record of the opt-out itself. That last one matters most, because the
    // record of an unsubscribe is what stops them being emailed again after a
    // re-import or a fresh signup. Deleting it means the next signup looks like
    // consent.
    await suppressEmail(email, "self");
  } catch (error) {
    console.error("[1127] unsubscribe failed", error);
    return NextResponse.json(
      { ok: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, email });
}

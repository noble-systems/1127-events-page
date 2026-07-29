import { NextResponse } from "next/server";
import { deleteSubmission, listSubmissions } from "@/lib/store";
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
    // Remove every record for this address, not just the RSVP row.
    const rows = await listSubmissions();
    const mine = rows.filter((row) => row.email === email);
    await Promise.all(mine.map((row) => deleteSubmission(row.pk)));
  } catch (error) {
    console.error("[1127] unsubscribe failed", error);
    return NextResponse.json(
      { ok: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, email });
}

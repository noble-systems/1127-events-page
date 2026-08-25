import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DOOR_COOKIE, DOOR_SESSION_HOURS, mintDoorToken } from "@/lib/door-auth";
import { findDoorPassByPin, patchDoorPass } from "@/lib/door-store";
import { consume } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/email";
import { clientIp } from "@/lib/request-meta";

/**
 * POST /api/door/login  { pin }
 *
 * Trades a door PIN for a 24-hour session cookie. Rate limited hard: the
 * PIN space is 31^8 and ten guesses per window means online guessing is a
 * losing career. The PIN is normalised (case, hyphens, spaces) because it
 * gets typed on a phone in the dark.
 */
/**
 * GET /api/door/login?pin=...  the QR path: the admin page renders a QR of
 * this URL per pass, a phone's native camera scans it, and the phone is
 * signed in and standing on /door with no typing at a dark call time. Same
 * normalisation, same rate limit, same cookie as the typed path; failure
 * redirects back to the PIN form with its message.
 */
export async function GET(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  const throttle = await consume("doorLogin", ip);
  const url = new URL(request.url);

  if (throttle.allowed) {
    const raw = url.searchParams.get("pin") ?? "";
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pin =
      cleaned.length === 8 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : "";
    const pass = pin ? await findDoorPassByPin(pin) : null;

    if (pass) {
      const jar = await cookies();
      jar.set(DOOR_COOKIE, mintDoorToken(pass.id), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: DOOR_SESSION_HOURS * 60 * 60,
      });
      await patchDoorPass(pass.id, { lastUsedAt: new Date().toISOString() });
      // siteUrl(), not request.url: behind the proxy the request host is the
    // internal localhost, and a redirect there strands the phone.
    return NextResponse.redirect(new URL("/door", siteUrl()), 303);
    }
  }

  return NextResponse.redirect(new URL("/door?bad=1", siteUrl()), 303);
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  const throttle = await consume("doorLogin", ip);
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many tries. Wait a few minutes." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const raw = typeof body?.pin === "string" ? body.pin : "";
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pin = cleaned.length === 8 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : "";

  const pass = pin ? await findDoorPassByPin(pin) : null;
  if (!pass) {
    return NextResponse.json(
      { ok: false, message: "That PIN doesn't open the door." },
      { status: 401 },
    );
  }

  const jar = await cookies();
  jar.set(DOOR_COOKIE, mintDoorToken(pass.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DOOR_SESSION_HOURS * 60 * 60,
  });
  await patchDoorPass(pass.id, { lastUsedAt: new Date().toISOString() });

  return NextResponse.json({ ok: true, label: pass.label });
}

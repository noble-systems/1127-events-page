import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  campaignKey,
  countryKey,
  dayKey,
  isBotAgent,
  normalisePath,
  refererHost,
} from "@/lib/analytics";
import { recordView } from "@/lib/analytics-store";
import { parseCampaign } from "@/lib/request-meta";
import { siteUrl } from "@/lib/email";

/**
 * POST /api/beacon  { path, ref?, query? }
 *
 * The whole of the analytics pipeline's front door. It counts a page view and
 * says nothing back worth reading, because the sender is `navigator.sendBeacon`
 * and nobody is listening.
 *
 * What is deliberately NOT here:
 *   - No rate limiter. This is the one endpoint whose normal traffic pattern
 *     looks like a flood, and the limiter's Dynamo work would cost more than
 *     the counter it protects.
 *   - No cookies read except one: the admin session's presence, so the team's
 *     own browsing does not pollute the numbers.
 *   - No IP storage, no fingerprinting, no per-visitor anything.
 *
 * Requests that honour Do Not Track or Global Privacy Control never reach
 * here; the client checks before sending. The server still drops bots, junk
 * paths, and anything oversized.
 */
export async function POST(request: Request) {
  const done = NextResponse.json({ ok: true }, { status: 202 });

  if (isBotAgent(request.headers.get("user-agent"))) return done;

  const jar = await cookies();
  if (jar.get("1127_admin")) return done;

  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
    ref?: unknown;
    query?: unknown;
  } | null;

  const rawPath = typeof body?.path === "string" ? body.path : "";
  const path = normalisePath(rawPath);
  if (!path) return done;

  const entries: Array<Parameters<typeof recordView>[0][number]> = [
    { kind: "day", key: "-" },
    { kind: "path", key: path },
  ];

  const ownHost = new URL(siteUrl()).hostname;
  const ref = refererHost(
    typeof body?.ref === "string" ? body.ref.slice(0, 500) : null,
    ownHost,
  );
  if (ref) entries.push({ kind: "ref", key: ref });

  const query = typeof body?.query === "string" ? body.query.slice(0, 500) : "";
  const utm = campaignKey(parseCampaign(`${path}${query}`));
  if (utm) entries.push({ kind: "utm", key: utm });

  const geo = countryKey(request.headers.get("cloudfront-viewer-country"));
  if (geo) entries.push({ kind: "geo", key: geo });

  await recordView(entries, dayKey());
  return done;
}


import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  browserKey,
  campaignKey,
  countryKey,
  dayKey,
  deviceKey,
  hourKey,
  isBotAgent,
  normalisePath,
  refererHost,
  visitorHash,
} from "@/lib/analytics";
import { appendVisit, recordView } from "@/lib/analytics-store";
import { clientIp, parseCampaign } from "@/lib/request-meta";
import { siteUrl } from "@/lib/email";
import { appSecret } from "@/lib/tokens";

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
    dwell?: unknown;
    event?: unknown;
  } | null;

  // A named funnel tick: counted and done. The allow-list is the schema.
  if (typeof body?.event === "string") {
    if (body.event === "tier_pick" || body.event === "buy_click") {
      await recordView([{ kind: "ev", key: body.event }], dayKey());
    }
    return done;
  }

  const rawPath = typeof body?.path === "string" ? body.path : "";
  const path = normalisePath(rawPath);
  if (!path) return done;

  // A dwell report: seconds on one page, clamped so a laptop left open all
  // night cannot skew the average into fiction.
  if (typeof body?.dwell === "number") {
    const seconds = Math.min(1800, Math.max(1, Math.round(body.dwell)));
    await recordView(
      [
        { kind: "dwellS", key: path, amount: seconds },
        { kind: "dwellN", key: path },
      ],
      dayKey(),
    );
    return done;
  }

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

  const userAgent = request.headers.get("user-agent");
  const device = deviceKey(userAgent);
  const browser = browserKey(userAgent);
  entries.push({ kind: "hour", key: hourKey() });
  entries.push({ kind: "dev", key: device });
  entries.push({ kind: "browser", key: browser });

  /**
   * The unique-visitor tick. The hash is HMAC(secret+day, ip+agent): raw
   * inputs never stored, unreversible, and a different value tomorrow by
   * construction, so it can count today's visitors and can never follow one.
   * Counting a visitor once per day means the row is simply written again on
   * repeat views; the dashboard counts rows, not additions.
   */
  entries.push({
    kind: "uniq",
    key: visitorHash(appSecret(), dayKey(), clientIp(request.headers), userAgent),
  });

  await Promise.all([
    recordView(entries, dayKey()),
    appendVisit({
      ts: new Date().toISOString(),
      path,
      ref,
      utm,
      geo,
      device,
      browser,
    }),
  ]);
  return done;
}


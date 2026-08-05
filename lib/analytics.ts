/**
 * First-party, cookieless page analytics.
 *
 * The site counts page views itself instead of loading Google Analytics, a
 * deliberate choice with a specific shape:
 *
 *   - No cookies, no identifiers, no sessions. A view is one anonymous tick on
 *     a daily counter. The cookies page promises "no analytics cookies, no
 *     third-party scripts", and this keeps that sentence true.
 *   - First-party, so the ad blockers that swallow a third of GA traffic (and
 *     more of a young nightlife audience) never see anything to block.
 *   - Aggregates only: per day, per path, per referrer host, per campaign, per
 *     country. There is deliberately nothing here that could reconstruct one
 *     person's browsing.
 *
 * What this does not give: demographics, cross-site attribution, ads
 * integration. If paid campaigns ever need those, GA can be added alongside;
 * nothing here conflicts.
 *
 * This module is pure so the parsing rules are testable without AWS.
 */

export type MetricKind = "day" | "path" | "ref" | "utm" | "geo";

/** UTC day, because counters need one unambiguous bucket boundary. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The storage key for one counter. Lives in the rate-limit table, whose rows
 * are namespaced by their own prefixes; "m#" keeps these distinguishable and
 * lets the dashboard scan just its own rows.
 */
export function metricPk(kind: MetricKind, day: string, key: string): string {
  return `m#${kind}#${day}#${key}`;
}

export function parseMetricPk(
  pk: string,
): { kind: MetricKind; day: string; key: string } | null {
  const match = pk.match(/^m#(day|path|ref|utm|geo)#(\d{4}-\d{2}-\d{2})#(.*)$/);
  if (!match) return null;
  return { kind: match[1] as MetricKind, day: match[2], key: match[3] };
}

/**
 * A path we are willing to count.
 *
 * Query strings are stripped (utm is counted separately), trailing slashes
 * collapse, and anything under /admin or /api is nobody's business, including
 * ours. Returns null for paths that should not be counted at all.
 */
export function normalisePath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) {
    return null;
  }
  if (!raw.startsWith("/")) return null;

  let path = raw.split("?")[0].split("#")[0];
  if (!/^[a-zA-Z0-9\-_/.%]*$/.test(path.slice(1))) return null;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "") path = "/";

  if (path.startsWith("/admin") || path.startsWith("/api")) return null;
  if (path.startsWith("/_next") || path.includes("..")) return null;

  return path.slice(0, 120);
}

/**
 * The referrer reduced to a bare host: where traffic comes from, not which
 * page somebody was reading. Same-site referrers are navigation, not sources,
 * and return null.
 */
export function refererHost(
  raw: string | null | undefined,
  ownHost: string,
): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === ownHost.toLowerCase().replace(/^www\./, "")) {
      return null;
    }
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

/**
 * One label for a campaign visit, "source/campaign". Either half may be
 * missing; both missing means no campaign and nothing recorded.
 */
export function campaignKey(utm: {
  utmSource?: string;
  utmCampaign?: string;
}): string | null {
  const source = utm.utmSource?.trim();
  const campaign = utm.utmCampaign?.trim();
  if (!source && !campaign) return null;
  return `${source || "unknown"}/${campaign || "unknown"}`.slice(0, 120);
}

/**
 * Crawlers and preview fetchers are not visitors. This list is deliberately
 * the obvious offenders rather than an arms race: a bot that lies about its
 * agent inflates the numbers slightly, and that costs less than maintaining a
 * fingerprinting habit this site does not want.
 */
export function isBotAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|headless|preview|fetch|monitor|scan|curl|wget|python|node-fetch|axios|lighthouse|pingdom|facebookexternalhit|whatsapp|telegram/i.test(
    userAgent,
  );
}

/** ISO country from the CloudFront header, or null when absent or junk. */
export function countryKey(header: string | null | undefined): string | null {
  const value = header?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : null;
}

/** The last N UTC days, oldest first, for the dashboard's range. */
export function lastDays(count: number, now: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    days.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  return days;
}

/**
 * Request metadata captured with every submission.
 *
 * Everything here is derived from headers the browser already sends plus the
 * page the form was on. No fingerprinting, no third-party scripts. It exists so
 * the team can tell a real signup from a bot, see which campaign produced it,
 * and know how to follow up.
 *
 * Disclosed in /privacy. Keep the two in step.
 */

export type RequestMeta = {
  ip?: string;
  country?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  /** Page the form was submitted from, including its query string. */
  page?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

/** Nothing stored from a request is allowed to be unbounded. */
const LIMITS = {
  ip: 45, // an IPv6 address with a zone id
  country: 8,
  userAgent: 400,
  page: 300,
  referrer: 300,
  utm: 120,
} as const;

function clean(value: string | null | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;

  // Drop C0 control characters and DEL so a hostile header can't corrupt a
  // log line, a CSV cell or the admin table. Done by code point rather than
  // regex so the source file stays free of literal control characters.
  let stripped = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    stripped += char;
  }

  const trimmed = stripped.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Client IP                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Behind CloudFront the client address is the FIRST entry in x-forwarded-for;
 * everything after it is the proxy chain. Values can arrive with ports
 * (`1.2.3.4:5678`) or as bracketed IPv6 (`[::1]:443`).
 */
export function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const candidate =
    forwarded?.split(",")[0] ??
    headers.get("x-real-ip") ??
    headers.get("cloudfront-viewer-address") ??
    undefined;

  const value = clean(candidate, LIMITS.ip);
  if (!value) return undefined;

  // [2001:db8::1]:443 -> 2001:db8::1
  const bracketed = value.match(/^\[([^\]]+)\]/);
  if (bracketed) return bracketed[1];

  // 1.2.3.4:5678 -> 1.2.3.4 (only when there's exactly one colon, so bare
  // IPv6 addresses are left alone)
  const colons = value.split(":").length - 1;
  if (colons === 1) return value.split(":")[0];

  return value;
}

/* -------------------------------------------------------------------------- */
/* User agent                                                                  */
/* -------------------------------------------------------------------------- */

export type ParsedAgent = { browser: string; os: string; device: string };

const UNKNOWN: ParsedAgent = {
  browser: "Unknown",
  os: "Unknown",
  device: "Unknown",
};

/**
 * Deliberately small. Order matters: Edge and Opera both claim to be Chrome,
 * and Chrome claims to be Safari, so the most specific test has to run first.
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedAgent {
  const ua = clean(userAgent, LIMITS.userAgent);
  if (!ua) return UNKNOWN;

  const version = (pattern: RegExp) => ua.match(pattern)?.[1]?.split(".")[0];

  let browser = "Unknown";
  if (/\bEdg[A-Z]?\//.test(ua))
    browser = `Edge ${version(/\bEdg[A-Z]?\/(\d+)/) ?? ""}`;
  else if (/\bOPR\/|\bOpera\//.test(ua))
    browser = `Opera ${version(/\b(?:OPR|Opera)\/(\d+)/) ?? ""}`;
  else if (/\bSamsungBrowser\//.test(ua))
    browser = `Samsung Internet ${version(/SamsungBrowser\/(\d+)/) ?? ""}`;
  else if (/\bFirefox\/|\bFxiOS\//.test(ua))
    browser = `Firefox ${version(/(?:Firefox|FxiOS)\/(\d+)/) ?? ""}`;
  else if (/\bCriOS\//.test(ua))
    browser = `Chrome ${version(/CriOS\/(\d+)/) ?? ""}`;
  else if (/\bChrome\//.test(ua))
    browser = `Chrome ${version(/Chrome\/(\d+)/) ?? ""}`;
  else if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua))
    browser = `Safari ${version(/Version\/(\d+)/) ?? ""}`;
  else if (/\bbot\b|crawler|spider|slurp|HeadlessChrome/i.test(ua)) browser = "Bot";

  let os = "Unknown";
  if (/\biPhone\b|\biPod\b/.test(ua)) os = "iOS";
  else if (/\biPad\b/.test(ua)) os = "iPadOS";
  else if (/\bAndroid\b/.test(ua)) os = `Android ${version(/Android (\d+)/) ?? ""}`;
  else if (/\bWindows NT\b/.test(ua)) os = "Windows";
  else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) os = "macOS";
  else if (/\bCrOS\b/.test(ua)) os = "ChromeOS";
  else if (/\bLinux\b/.test(ua)) os = "Linux";

  let device = "Desktop";
  if (/\biPad\b|\bTablet\b|Android(?!.*\bMobile\b)/.test(ua)) device = "Tablet";
  else if (/\bMobi\b|\bMobile\b|\biPhone\b|\biPod\b/.test(ua)) device = "Phone";
  if (browser === "Bot") device = "Bot";

  return {
    browser: browser.trim(),
    os: os.trim(),
    device,
  };
}

/* -------------------------------------------------------------------------- */

/** Pulls the campaign tags out of the page URL the form was submitted from. */
export function parseCampaign(page: string | undefined): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} {
  if (!page) return {};

  const queryStart = page.indexOf("?");
  if (queryStart === -1) return {};

  try {
    const params = new URLSearchParams(page.slice(queryStart + 1));
    return {
      utmSource: clean(params.get("utm_source"), LIMITS.utm),
      utmMedium: clean(params.get("utm_medium"), LIMITS.utm),
      utmCampaign: clean(params.get("utm_campaign"), LIMITS.utm),
    };
  } catch {
    return {};
  }
}

/**
 * Builds the record stored alongside a submission.
 *
 * `page` and `referrer` come from the browser and are therefore untrusted:
 * they are length-capped and stripped of control characters like everything
 * else, and never used for anything but display.
 */
export function buildRequestMeta(
  headers: Headers,
  client: { page?: unknown; referrer?: unknown },
): RequestMeta {
  const userAgent = clean(headers.get("user-agent"), LIMITS.userAgent);
  const agent = parseUserAgent(userAgent);
  const page = clean(
    typeof client.page === "string" ? client.page : undefined,
    LIMITS.page,
  );

  const meta: RequestMeta = {
    ip: clientIp(headers),
    country: clean(headers.get("cloudfront-viewer-country"), LIMITS.country),
    userAgent,
    browser: agent.browser === "Unknown" ? undefined : agent.browser,
    os: agent.os === "Unknown" ? undefined : agent.os,
    device: agent.device === "Unknown" ? undefined : agent.device,
    page,
    referrer:
      clean(
        typeof client.referrer === "string" ? client.referrer : undefined,
        LIMITS.referrer,
      ) ?? clean(headers.get("referer"), LIMITS.referrer),
    ...parseCampaign(page),
  };

  // Drop empty keys so DynamoDB doesn't store a wall of nulls.
  for (const key of Object.keys(meta) as Array<keyof RequestMeta>) {
    if (meta[key] === undefined) delete meta[key];
  }

  return meta;
}

/** Short, human-readable summary for a table cell. */
export function describeSource(meta: RequestMeta | undefined): string {
  if (!meta) return "Unknown";
  if (meta.utmSource) {
    return meta.utmCampaign
      ? `${meta.utmSource} / ${meta.utmCampaign}`
      : meta.utmSource;
  }
  if (meta.referrer) {
    try {
      return new URL(meta.referrer).hostname.replace(/^www\./, "");
    } catch {
      return meta.referrer.slice(0, 40);
    }
  }
  return "Direct";
}

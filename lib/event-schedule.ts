/**
 * Turns the free-text date ("Aug 30", "Saturday, May 16, 2026") and hours
 * ("12-4 PM") an admin types into the ISO timestamps schema.org needs for
 * Google's event rich results. Free text stays the source of truth on the
 * page; this parser is best effort, and anything it cannot read simply means
 * no structured schedule, never a wrong one.
 *
 * All output carries the Phoenix offset. Arizona does not observe DST, so
 * -07:00 is correct year round.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const PHOENIX_OFFSET = "-07:00";

/** Today's date parts in Phoenix, for inferring a missing year. */
function phoenixToday(now: Date): { y: number; m: number; d: number } {
  const text = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = text.split("-").map(Number);
  return { y, m, d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "Aug 30", "August 30, 2026", "Saturday, May 16" → {y, m, d} or null. */
export function parseEventDate(
  raw: string,
  now: Date = new Date(),
): { y: number; m: number; d: number } | null {
  const text = raw.trim().toLowerCase();
  if (!text || /announc|soon|tba|to be/.test(text)) return null;

  const match = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/,
  );
  if (!match) return null;

  const m = MONTHS[match[1]];
  const d = Number(match[2]);
  if (d < 1 || d > 31) return null;

  let y = match[3] ? Number(match[3]) : 0;
  if (!y) {
    // No year written: the next time that month-and-day comes around. A date
    // earlier than today belongs to next year, with one day of grace so an
    // event page is not misdated during the night it happens.
    const today = phoenixToday(now);
    y = today.y;
    if (m < today.m || (m === today.m && d < today.d - 1)) y += 1;
  }
  return { y, m, d };
}

/**
 * "12-4 PM", "9 PM - 1 AM", "7pm" → 24h start/end. A first hour without its
 * own am/pm borrows from the second ("12-4 PM" is noon to four). An end at
 * or before the start rolls to the next day (9 PM - 1 AM).
 */
export function parseEventHours(
  raw: string,
): { startH: number; startMin: number; endH: number | null; endNextDay: boolean } | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const clock = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g;
  const tokens: Array<{ h: number; min: number; mer: string | null }> = [];
  for (const match of text.matchAll(clock)) {
    const h = Number(match[1]);
    if (h < 1 || h > 12) return null;
    tokens.push({
      h,
      min: match[2] ? Number(match[2]) : 0,
      mer: match[3] ?? null,
    });
    if (tokens.length === 2) break;
  }
  if (tokens.length === 0) return null;

  const to24 = (h: number, mer: string): number => {
    if (mer === "am") return h === 12 ? 0 : h;
    return h === 12 ? 12 : h + 12;
  };

  const [a, b] = tokens;
  if (!b) {
    if (!a.mer) return null;
    return { startH: to24(a.h, a.mer), startMin: a.min, endH: null, endNextDay: false };
  }

  const merB = b.mer ?? a.mer;
  const merA = a.mer ?? b.mer;
  if (!merA || !merB) return null;

  const startH = to24(a.h, merA);
  const endH = to24(b.h, merB);
  return {
    startH,
    startMin: a.min,
    endH,
    endNextDay: endH <= startH,
  };
}

export type EventSchedule = {
  /** ISO with Phoenix offset, or a bare date when no hours are known. */
  startDate: string;
  endDate?: string;
};

/** The full schedule, or null when the free text does not commit to one. */
export function eventSchedule(
  date: string | null | undefined,
  time: string | null | undefined,
  now: Date = new Date(),
): EventSchedule | null {
  const day = parseEventDate(date ?? "", now);
  if (!day) return null;

  const base = `${day.y}-${pad(day.m)}-${pad(day.d)}`;
  const hours = time ? parseEventHours(time) : null;
  if (!hours) return { startDate: base };

  const startDate = `${base}T${pad(hours.startH)}:${pad(hours.startMin)}:00${PHOENIX_OFFSET}`;
  if (hours.endH === null) return { startDate };

  let end = base;
  if (hours.endNextDay) {
    const next = new Date(Date.UTC(day.y, day.m - 1, day.d) + 86_400_000);
    end = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }
  return {
    startDate,
    endDate: `${end}T${pad(hours.endH)}:00:00${PHOENIX_OFFSET}`,
  };
}

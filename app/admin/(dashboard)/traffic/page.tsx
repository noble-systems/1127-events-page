import type { Metadata } from "next";
import { lastDays, type VisitLogEntry } from "@/lib/analytics";
import {
  readMetrics,
  readVisitLog,
  type MetricRow,
} from "@/lib/analytics-store";
import { listSubmissions } from "@/lib/store";

export const metadata: Metadata = { title: "Traffic" };
export const dynamic = "force-dynamic";

/**
 * The last thirty days of first-party traffic, at two depths.
 *
 * Aggregates: days, hours, paths, sources, campaigns, countries, devices,
 * browsers, and unique visitors counted by a daily-rotating anonymous hash
 * that cannot follow anyone across days. Individual visits: a thirty-day
 * rolling feed of identifier-free rows, when/what/from-where/on-what, never
 * who. "Who" exists only where people identify themselves: the CRM, where
 * every signup carries its own source, device and landing page.
 */

const DAYS = 30;

function sumBy(rows: MetricRow[], kind: MetricRow["kind"]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.kind === kind) out.set(row.key, (out.get(row.key) ?? 0) + row.count);
  }
  return out;
}

function Top({
  title,
  entries,
  empty,
  labels,
}: {
  title: string;
  entries: Array<[string, number]>;
  empty: string;
  labels?: (key: string) => string;
}) {
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top[0]?.[1] ?? 0;

  return (
    <section className="border-ink/12 bg-bone rounded-2xl border p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {top.length === 0 ? (
        <p className="text-ink/65 mt-4 text-[0.875rem]">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {top.map(([key, count]) => (
            <li key={key} className="text-[0.875rem]">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate">{labels?.(key) ?? key}</span>
                <span className="text-ink/65 tabular-nums">{count}</span>
              </div>
              <div className="bg-ink/[0.06] mt-1 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-cobalt/60 h-full rounded-full"
                  style={{ width: `${Math.max(4, (100 * count) / max)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TrafficPage() {
  const days = lastDays(DAYS);
  const [rows, submissions, visits] = await Promise.all([
    readMetrics(days),
    listSubmissions(),
    readVisitLog(40),
  ]);

  // Uniques are rows, not sums: each visitor-day hash is one row however many
  // pages that visitor read.
  const uniqPerDay = new Map<string, number>();
  for (const row of rows) {
    if (row.kind === "uniq") {
      uniqPerDay.set(row.day, (uniqPerDay.get(row.day) ?? 0) + 1);
    }
  }
  const visitors = [...uniqPerDay.values()].reduce((a, b) => a + b, 0);

  const perDay = new Map(
    rows.filter((r) => r.kind === "day").map((r) => [r.day, r.count]),
  );
  const total = [...perDay.values()].reduce((a, b) => a + b, 0);
  const maxDay = Math.max(1, ...perDay.values());

  const rsvpPerDay = new Map<string, number>();
  for (const s of submissions) {
    if (s.type !== "rsvp") continue;
    const day = s.createdAt.slice(0, 10);
    if (days.includes(day)) rsvpPerDay.set(day, (rsvpPerDay.get(day) ?? 0) + 1);
  }
  const rsvpTotal = [...rsvpPerDay.values()].reduce((a, b) => a + b, 0);

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl">Traffic</h1>
        <p className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
          Counted on our own servers, without cookies. Visitors are a daily
          anonymous hash that cannot follow anyone across days; the visit feed
          below records what happened, never who. Ad blockers do not blind any
          of it, and browsers sending Do Not Track are never counted.
        </p>
      </header>

      <Summary
        days={days}
        perDay={perDay}
        uniqPerDay={uniqPerDay}
        rsvpPerDay={rsvpPerDay}
        rows={rows}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border-ink/12 bg-bone rounded-2xl border p-6">
          <p className="label-xs text-ink/65">Views, last {DAYS} days</p>
          <p className="font-display mt-3 text-4xl leading-none">{total}</p>
        </div>
        <div className="border-ink/12 bg-bone rounded-2xl border p-6">
          <p className="label-xs text-ink/65">Visitors, last {DAYS} days</p>
          <p className="font-display mt-3 text-4xl leading-none">{visitors}</p>
        </div>
        <div className="border-ink/12 bg-bone rounded-2xl border p-6">
          <p className="label-xs text-ink/65">RSVPs, last {DAYS} days</p>
          <p className="font-display mt-3 text-4xl leading-none">{rsvpTotal}</p>
        </div>
        <div className="border-ink/12 bg-bone rounded-2xl border p-6">
          <p className="label-xs text-ink/65">Views per RSVP</p>
          <p className="font-display mt-3 text-4xl leading-none">
            {rsvpTotal > 0 ? Math.round(total / rsvpTotal) : "–"}
          </p>
        </div>
      </div>

      <section className="border-ink/12 bg-bone mt-6 rounded-2xl border p-6">
        <h2 className="font-display text-xl">By day</h2>
        <div className="mt-5 flex h-36 items-end gap-[3px]">
          {days.map((day) => {
            const views = perDay.get(day) ?? 0;
            const rsvps = rsvpPerDay.get(day) ?? 0;
            return (
              <div
                key={day}
                title={`${day}: ${views} views, ${rsvps} RSVPs`}
                className="group flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className={`w-full rounded-t-sm ${rsvps > 0 ? "bg-sun-deep/80" : "bg-cobalt/55"} group-hover:bg-cobalt`}
                  style={{ height: `${Math.max(views > 0 ? 4 : 1, (100 * views) / maxDay)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="text-ink/50 mt-2 flex justify-between text-[0.75rem]">
          <span>{days[0]}</span>
          <span className="text-sun-deep">amber = a day with RSVPs</span>
          <span>{days[days.length - 1]}</span>
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Top
          title="Pages"
          entries={[...sumBy(rows, "path").entries()]}
          empty="No views recorded yet. They start counting from this deploy."
        />
        <Top
          title="Sources"
          entries={[...sumBy(rows, "ref").entries()]}
          empty="No outside referrers yet. Direct visits and same-site navigation do not count here."
        />
        <Top
          title="Campaigns"
          entries={[...sumBy(rows, "utm").entries()]}
          empty="No campaign-tagged visits yet. Links with utm_source or utm_campaign land here."
        />
        <Top
          title="Countries"
          entries={[...sumBy(rows, "geo").entries()]}
          empty="No country data yet. It comes from the CDN's own header, not from IP lookups."
        />
        <Top
          title="Devices"
          entries={[...sumBy(rows, "dev").entries()]}
          empty="No device data yet."
        />
        <Top
          title="Browsers"
          entries={[...sumBy(rows, "browser").entries()]}
          empty="No browser data yet."
        />
      </div>

      <section className="border-ink/12 bg-bone mt-6 rounded-2xl border p-6">
        <h2 className="font-display text-xl">By hour of day</h2>
        <p className="text-ink/65 mt-2 text-[0.8125rem]">
          Phoenix time, all {DAYS} days combined. This is when people are
          actually looking.
        </p>
        <HourChart entries={sumBy(rows, "hour")} />
      </section>

      <section className="border-ink/12 bg-bone mt-6 rounded-2xl border p-6">
        <h2 className="font-display text-xl">Recent visits</h2>
        <p className="text-ink/65 mt-2 max-w-2xl text-[0.8125rem] leading-relaxed">
          The last individual page views: when, what, from where, on what.
          Deliberately nothing that says who, and nothing that connects two
          rows to one person. Rows older than thirty days delete themselves.
          People who identify themselves are in People, where each profile
          carries its own source, device and landing page.
        </p>
        <VisitFeed visits={visits} />
      </section>
    </div>
  );
}

/**
 * The sentence a person actually wants first: what happened lately, in words.
 * The charts below elaborate; this is the summary.
 */
function Summary({
  days,
  perDay,
  uniqPerDay,
  rsvpPerDay,
  rows,
}: {
  days: string[];
  perDay: Map<string, number>;
  uniqPerDay: Map<string, number>;
  rsvpPerDay: Map<string, number>;
  rows: MetricRow[];
}) {
  const last7 = days.slice(-7);
  const views7 = last7.reduce((a, d) => a + (perDay.get(d) ?? 0), 0);
  const visitors7 = last7.reduce((a, d) => a + (uniqPerDay.get(d) ?? 0), 0);
  const rsvps7 = last7.reduce((a, d) => a + (rsvpPerDay.get(d) ?? 0), 0);

  const topSource = [...sumBy(rows, "ref").entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topPage = [...sumBy(rows, "path").entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  const sentence =
    views7 === 0
      ? "No traffic recorded yet. Counting is live; the first visits will appear here."
      : `${views7} page ${views7 === 1 ? "view" : "views"} from ${visitors7} ${
          visitors7 === 1 ? "visitor" : "visitors"
        }, ${rsvps7 === 0 ? "no RSVPs yet" : `${rsvps7} ${rsvps7 === 1 ? "RSVP" : "RSVPs"}`}${
          topSource ? `, with ${topSource[0]} the biggest outside source` : ""
        }${topPage ? `, and ${topPage[0]} the most-read page` : ""}.`;

  return (
    <section className="border-sun/40 bg-sun/10 mt-10 rounded-2xl border p-6">
      <p className="label-xs text-ink/65">The last seven days, in a sentence</p>
      <p className="font-display mt-3 text-xl leading-snug sm:text-2xl">
        {sentence}
      </p>
    </section>
  );
}

function HourChart({ entries }: { entries: Map<string, number> }) {
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const max = Math.max(1, ...entries.values());
  return (
    <div className="mt-5 flex h-24 items-end gap-[3px]">
      {hours.map((h) => {
        const n = entries.get(h) ?? 0;
        return (
          <div
            key={h}
            title={`${h}:00, ${n} views`}
            className="flex h-full flex-1 flex-col justify-end"
          >
            <div
              className="bg-cobalt/55 hover:bg-cobalt w-full rounded-t-sm"
              style={{ height: `${Math.max(n > 0 ? 6 : 1, (100 * n) / max)}%` }}
            />
            {["00", "06", "12", "18"].includes(h) ? (
              <span className="text-ink/50 mt-1 text-[0.65rem]">{Number(h)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function VisitFeed({ visits }: { visits: VisitLogEntry[] }) {
  if (visits.length === 0) {
    return (
      <p className="border-ink/25 bg-bone/60 text-ink/65 mt-4 rounded-2xl border border-dashed px-6 py-8 text-center text-[0.875rem]">
        Nothing yet. Visits appear here within seconds of happening.
      </p>
    );
  }

  const when = (ts: string) =>
    new Date(ts).toLocaleString("en-US", {
      timeZone: "America/Phoenix",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <ul className="divide-ink/10 border-ink/12 mt-4 divide-y overflow-hidden rounded-xl border">
      {visits.map((v, i) => (
        <li
          key={`${v.ts}-${i}`}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-[0.8125rem]"
        >
          <span className="text-ink/50 w-32 shrink-0 tabular-nums">
            {when(v.ts)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{v.path}</span>
          {v.ref ? <span className="text-cobalt">{v.ref}</span> : null}
          {v.utm ? <span className="text-sun-deep">{v.utm}</span> : null}
          <span className="text-ink/65">{v.device}</span>
          <span className="text-ink/50">{v.browser}</span>
          {v.geo ? <span className="text-ink/50">{v.geo}</span> : null}
        </li>
      ))}
    </ul>
  );
}

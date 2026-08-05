import type { Metadata } from "next";
import { lastDays } from "@/lib/analytics";
import { readMetrics, type MetricRow } from "@/lib/analytics-store";
import { listSubmissions } from "@/lib/store";

export const metadata: Metadata = { title: "Traffic" };
export const dynamic = "force-dynamic";

/**
 * The last thirty days of first-party page counts.
 *
 * Everything on this screen is an aggregate: days, paths, referrer hosts,
 * campaigns, countries. There are deliberately no sessions, visitors or
 * journeys, because nothing of the kind is collected. RSVPs come from the
 * store the CRM already keeps, shown beside the views so traffic and outcome
 * sit in one glance.
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
  const [rows, submissions] = await Promise.all([
    readMetrics(days),
    listSubmissions(),
  ]);

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
          Counted on our own servers, without cookies: days, pages, sources and
          countries, nothing about individuals. Ad blockers do not blind it,
          and visitors who send Do Not Track are never counted at all.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="border-ink/12 bg-bone rounded-2xl border p-6">
          <p className="label-xs text-ink/65">Views, last {DAYS} days</p>
          <p className="font-display mt-3 text-4xl leading-none">{total}</p>
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
      </div>
    </div>
  );
}

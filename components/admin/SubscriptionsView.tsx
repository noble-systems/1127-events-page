"use client";

import Link from "next/link";
import { useState } from "react";
import { Pager, SearchBox, usePaginated } from "@/components/admin/Paginate";
import type { SubscriptionSummary } from "@/lib/audience";
import { toUrlId } from "@/lib/ids";
import { UNSUBSCRIBE_SOURCE_LABELS, type SubmissionRecord } from "@/lib/types";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="border-ink/12 bg-bone rounded-2xl border p-6">
      <p className="label-xs text-ink/65 flex min-h-[2.4em] items-start">{label}</p>
      <p className="font-display mt-3 text-4xl leading-none">{value}</p>
      <p className="text-ink/65 mt-3 text-[0.8125rem] leading-relaxed">{hint}</p>
    </div>
  );
}

/** Dates only. The exact minute is noise on this screen. */
function day(value: string | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function Row({
  record,
  right,
  meta,
}: {
  record: SubmissionRecord;
  right: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={`/admin/list/${toUrlId(record.pk)}`}
        className="hover:bg-bone-soft flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 transition-colors duration-200"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            {record.name?.trim() || record.email}
          </span>
          {record.name?.trim() ? (
            <span className="text-ink/65 block truncate text-[0.8125rem]">
              {record.email}
            </span>
          ) : null}
        </span>
        <span className="text-ink/65 text-[0.8125rem]">{meta}</span>
        <span className="text-ink/65 w-32 text-right text-[0.8125rem]">
          {right}
        </span>
      </Link>
    </li>
  );
}

export function SubscriptionsView({
  summary,
  rsvps,
  subscribedRows,
  unsubscribedRows,
}: {
  summary: SubscriptionSummary;
  rsvps: number;
  subscribedRows: SubmissionRecord[];
  unsubscribedRows: SubmissionRecord[];
}) {
  const [tab, setTab] = useState<"subscribed" | "off">("subscribed");
  const [query, setQuery] = useState("");

  const tabs = [
    { value: "subscribed" as const, label: "Subscribed", n: subscribedRows.length },
    { value: "off" as const, label: "Off the list", n: unsubscribedRows.length },
  ];

  const all = tab === "subscribed" ? subscribedRows : unsubscribedRows;
  const { filtered, visible, page, pages, setPage, start } = usePaginated(
    all,
    query,
    (row) => [row.name, row.email],
  );

  return (
    <>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Stat
          label="On the subscriber list"
          value={rsvps}
          hint="Everyone who has ever RSVPed. This number does not go down when somebody unsubscribes."
        />
        <Stat
          label="Subscribed"
          value={summary.subscribed}
          hint="Opted in and not since opted out. These are the people you may email."
        />
        <Stat
          label="Unsubscribed"
          value={summary.unsubscribed}
          hint="Asked to stop, or never opted in. Still on the subscriber list."
        />
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setTab(item.value);
                  setPage(0);
                }}
                aria-pressed={tab === item.value}
                className={`rounded-full px-4 py-2 text-[0.875rem] transition-colors duration-200 ${
                  tab === item.value
                    ? "bg-ink text-bone"
                    : "border-ink/15 text-ink/70 hover:border-ink/35 border"
                }`}
              >
                {item.label}
                <span className="ml-2 opacity-65">{item.n}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search name or email"
            />
            {tab === "subscribed" ? (
              <a
                href="/api/admin/audience"
                className="text-cobalt shrink-0 text-[0.875rem] underline-offset-4 hover:underline"
              >
                Export CSV
              </a>
            ) : null}
          </div>
        </div>

        <p className="text-ink/65 mt-4 max-w-2xl text-[0.9375rem] leading-relaxed">
          {tab === "subscribed"
            ? "The list itself. This is exactly who a send goes to: the same test runs here and at send time, so what you see and who receives it cannot disagree."
            : "Kept deliberately. An unsubscribe is a standing instruction, so this is the record that stops somebody being emailed again after a re-import or a fresh signup. Deleting it would make the next signup look like consent."}
        </p>

        {filtered.length === 0 ? (
          <p className="border-ink/25 bg-bone/60 text-ink/65 mt-5 rounded-2xl border border-dashed px-6 py-10 text-center text-[0.9375rem]">
            {query.trim()
              ? `Nobody matching "${query.trim()}".`
              : tab === "subscribed"
                ? "Nobody is subscribed yet."
                : "Nobody has come off the list."}
          </p>
        ) : (
          <ul className="border-ink/12 bg-bone divide-ink/10 mt-5 divide-y overflow-hidden rounded-2xl border">
            {visible.map((record) =>
              tab === "subscribed" ? (
                <Row
                  key={record.pk}
                  record={record}
                  meta={
                    record.eventIds?.length
                      ? `${record.eventIds.length} event${record.eventIds.length === 1 ? "" : "s"}`
                      : "No event"
                  }
                  right={day(record.createdAt)}
                />
              ) : (
                <Row
                  key={record.pk}
                  record={record}
                  meta={
                    record.status === "bounced"
                      ? UNSUBSCRIBE_SOURCE_LABELS.bounce
                      : record.unsubscribedSource
                        ? UNSUBSCRIBE_SOURCE_LABELS[record.unsubscribedSource]
                        : "Never opted in"
                  }
                  right={day(record.unsubscribedAt)}
                />
              ),
            )}
          </ul>
        )}

        <Pager
          page={page}
          pages={pages}
          total={filtered.length}
          start={start}
          shown={visible.length}
          onPage={setPage}
        />
      </section>
    </>
  );
}

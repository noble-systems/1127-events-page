"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pager } from "@/components/admin/Paginate";
import { PAGE_SIZE, pageOf } from "@/lib/paginate";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { toUrlId } from "@/lib/ids";
import { describeSource } from "@/lib/request-meta";
import {
  STATUS_LABELS,
  APPLICATION_STATUSES,
  LIST_STATUSES,
  normaliseStatus,
  type SubmissionRecord,
  type SubmissionStatus,
  type SubmissionType,
} from "@/lib/types";

/**
 * One tab per submission type, and no "Everyone".
 *
 * The four types are different kinds of record with different workflows: an
 * RSVP is a mailing list entry with a subscription state, an application moves
 * through a review pipeline. A combined view had to show the union of two status
 * sets, which meant offering "Declined" next to "Unsubscribed" on a list where
 * only one of them means anything.
 */
type TabValue = SubmissionType;

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: "rsvp", label: "Subscribers" },
  { value: "talent", label: "Talent" },
  { value: "ambassador", label: "Ambassadors" },
  { value: "partner", label: "Partner inquiries" },
];

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** The most useful third column differs per submission type. */
function detailFor(row: SubmissionRecord): string {
  return row.role || row.community || row.company || row.inquiryType || "Not given";
}

export function SubscriberTable({
  rows,
  ticketsByEmail = {},
}: {
  rows: SubmissionRecord[];
  /** "2 x Early Bird (Mirage)" style summaries, keyed by lowercase email. */
  ticketsByEmail?: Record<string, string>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabValue>("rsvp");
  /**
   * "open" is the review queue: an application that still needs a decision.
   *
   * It is meaningless for RSVPs, which are not a pipeline. Applying it to them
   * was the bug that made an unsubscribe look like a deletion: "open" excludes
   * unsubscribed and bounced, so opting out removed somebody from the RSVP list
   * on screen even though the row was still there. The RSVP tab shows everyone
   * by default and you filter down deliberately.
   */
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "open" | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    const base: Record<TabValue, number> = {
      rsvp: 0,
      talent: 0,
      ambassador: 0,
      partner: 0,
    };
    for (const row of rows) base[row.type] += 1;
    return base;
  }, [rows]);

  const newCount = useMemo(
    () =>
      rows.filter((row) => normaliseStatus(row.type, row.status) === "new").length,
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => row.type === tab)
      .filter((row) => {
        if (statusFilter === "all") return true;
        const status = normaliseStatus(row.type, row.status);
        // "Open" is the working queue: everything not yet closed out.
        if (statusFilter === "open") {
          // Still needing attention: not closed out, not unsubscribed.
          return !["archived", "declined", "unsubscribed", "bounced"].includes(
            status,
          );
        }
        return status === statusFilter;
      })
      .filter((row) =>
        needle
          ? [
              row.name,
              row.email,
              row.company,
              row.community,
              row.role,
              row.social,
              row.message,
              row.notes,
            ]
              .filter(Boolean)
              .some((field) => (field as string).toLowerCase().includes(needle))
          : true,
      );
  }, [rows, tab, statusFilter, query]);

  const remove = async (row: SubmissionRecord) => {
    if (!window.confirm(`Remove ${row.email} completely? This can't be undone.`))
      return;
    setBusy(row.pk);
    await fetch(`/api/admin/subscribers/${toUrlId(row.pk)}`, {
      method: "DELETE",
    });
    setBusy(null);
    router.refresh();
  };

  /**
   * An RSVP has a subscription state; everything else moves through a review
   * pipeline. Offering "Declined" on a mailing list would be meaningless, and
   * "Open" is just as meaningless there: an RSVP is never awaiting a decision.
   */
  const statusOptions: Array<SubmissionStatus | "open" | "all"> =
    tab === "rsvp"
      ? ["all", ...LIST_STATUSES]
      : ["all", "open", ...APPLICATION_STATUSES];

  /**
   * Paging.
   *
   * The table rendered every matching row. At a few hundred that is merely
   * slow; at ten thousand the page ships megabytes of markup and lays out a row
   * per person before anything is readable. Filtering still runs over the whole
   * set, so a search finds somebody on page forty rather than only among the
   * rows currently on screen.
   */
  const [requested, setRequested] = useState(0);
  // The same clamping the Subscriptions screen uses; see lib/paginate.
  const { page, pages, start } = pageOf(filtered.length, requested);
  const visible = filtered.slice(start, start + PAGE_SIZE);

  // Always scoped to the visible tab, so an export is one kind of record with
  // one meaning per column rather than a mix.
  const exportHref = `/api/admin/subscribers?type=${tab}&format=csv`;

  return (
    <div>
      {/* Type */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setTab(item.value);
              // The status vocabularies do not overlap, so a filter carried
              // across tabs would silently show nothing.
              setStatusFilter("all");
              setRequested(0);
            }}
            aria-pressed={tab === item.value}
            className={`rounded-full px-4 py-2 text-[0.875rem] transition-colors duration-200 ${
              tab === item.value
                ? "bg-ink text-bone"
                : "border-ink/20 text-ink/70 hover:border-ink/45 hover:text-ink border"
            }`}
          >
            {item.label}
            <span className="ml-2 opacity-65">{counts[item.value]}</span>
          </button>
        ))}
      </div>

      {/* Status */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="label-xs text-ink/65 mr-1">Status</span>
        {statusOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatusFilter(option)}
            aria-pressed={statusFilter === option}
            className={`rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
              statusFilter === option
                ? "bg-cobalt/12 text-cobalt ring-cobalt/30 ring-1"
                : "text-ink/65 hover:text-ink"
            }`}
          >
            {option === "all"
              ? "All"
              : option === "open"
                ? "Open"
                : STATUS_LABELS[option]}
            {option === "new" && newCount > 0 ? (
              <span className="bg-sun/30 text-sun-deep ml-1.5 rounded-full px-1.5 py-0.5 text-[0.6875rem]">
                {newCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="sub-search" className="sr-only">
            Search
          </label>
          <input
            id="sub-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setRequested(0);
            }}
            placeholder="Search names, emails, messages, notes…"
            className="border-ink/15 bg-bone placeholder:text-ink/50 hover:border-ink/30 w-full rounded-xl border px-4 py-3 text-[0.9375rem]"
          />
        </div>
        <a
          href={exportHref}
          className="bg-ink text-bone hover:bg-cobalt rounded-full px-5 py-3 text-[0.9375rem] transition-colors duration-200"
        >
          Export CSV
        </a>
      </div>

      {filtered.length === 0 ? (
        <div className="border-ink/25 bg-bone/60 mt-8 rounded-2xl border border-dashed p-10 text-center">
          <p className="font-display text-xl">
            {query ? "Nothing matches that search." : "Nothing here yet."}
          </p>
          <p className="text-ink/65 mx-auto mt-3 max-w-sm text-[0.9375rem] leading-relaxed">
            {query
              ? "Try a different term, or widen the status filter."
              : {
                  rsvp: "Nobody has joined the mailing list yet.",
                  talent: "No talent applications yet.",
                  ambassador: "No ambassador applications yet.",
                  partner: "No partner inquiries yet.",
                }[tab]}
          </p>
        </div>
      ) : (
        <div className="border-ink/12 bg-bone mt-8 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[66rem] border-collapse text-left">
            <thead>
              <tr className="border-ink/12 border-b">
                {[
                  "Name",
                  "Type",
                  "Detail",
                  "Email list",
                  "Source",
                  "Status",
                  "Added",
                  "",
                ].map((heading) => (
                  <th
                    key={heading || "actions"}
                    scope="col"
                    className="label-xs text-ink/65 px-5 py-4"
                  >
                    {heading || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const href = `/admin/list/${toUrlId(row.pk)}`;
                return (
                  <tr
                    key={row.pk}
                    className="border-ink/8 hover:bg-ink/[0.02] border-b align-top last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={href}
                        className="text-[0.9375rem] font-medium underline-offset-4 hover:underline"
                      >
                        {row.name || row.email}
                      </Link>
                      <p className="text-ink/65 mt-1 text-[0.8125rem]">
                        {row.email}
                      </p>
                      {ticketsByEmail[row.email] ? (
                        <p className="text-sun-deep mt-1 text-[0.8125rem]">
                          {ticketsByEmail[row.email]}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-5 py-4 text-[0.875rem] capitalize">
                      {row.type}
                    </td>
                    <td className="text-ink/70 px-5 py-4 text-[0.875rem]">
                      {detailFor(row)}
                      {row.notes ? (
                        <span
                          title="Has notes"
                          className="text-ink/45 ml-2 text-[0.75rem]"
                        >
                          ✎
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      {row.marketingOptIn ? (
                        <span className="text-[0.9375rem] text-emerald-700">
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">Opted in to event email</span>
                        </span>
                      ) : (
                        <span className="sr-only">Not opted in</span>
                      )}
                    </td>
                    <td className="text-ink/70 px-5 py-4 text-[0.875rem]">
                      {describeSource(row.meta)}
                      {row.meta?.device ? (
                        <p className="text-ink/45 mt-1 text-[0.75rem]">
                          {row.meta.device}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={normaliseStatus(row.type, row.status)} />
                    </td>
                    <td className="text-ink/70 px-5 py-4 text-[0.875rem] whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <Link
                        href={href}
                        className="text-cobalt text-[0.8125rem] underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={busy === row.pk}
                        className="text-terracotta-deep ml-4 text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        page={page}
        pages={pages}
        total={filtered.length}
        start={start}
        shown={visible.length}
        onPage={setRequested}
      />

      <p className="text-ink/65 mt-5 text-[0.8125rem] leading-relaxed">
        {filtered.length} of {counts[tab]}{" "}
        {TABS.find((t) => t.value === tab)?.label.toLowerCase()} match the current
        filters. Export gives you a UTF-8 CSV of this tab, including status and
        notes, and is never limited to the page on screen.
      </p>
    </div>
  );
}

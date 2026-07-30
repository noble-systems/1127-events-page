"use client";

import { useMemo, useState } from "react";
import { PAGE_SIZE, pageOf, searchRows } from "@/lib/paginate";

export { PAGE_SIZE };

/**
 * Search and paging for the admin lists.
 *
 * These screens rendered every row they were given. That is fine at fifty and
 * unusable at ten thousand: the page ships megabytes of markup and the browser
 * lays out a row per person before anything is readable. The alternative some
 * of this code took, quietly slicing to the first fifty, is worse, because a
 * truncated list looks exactly like a complete one.
 *
 * Filtering happens over the whole set and paging over the result, so a search
 * finds somebody on page forty rather than only among the rows on screen.
 */
export function usePaginated<T>(
  rows: readonly T[],
  query: string,
  haystack: (row: T) => Array<string | undefined>,
) {
  const filtered = useMemo(
    () => searchRows(rows, query, haystack),
    // haystack is defined inline by callers, so it is deliberately not a dep:
    // including it would rebuild the list on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query],
  );

  const [requested, setRequested] = useState(0);
  const { page, pages, start } = pageOf(filtered.length, requested);

  return {
    filtered,
    visible: filtered.slice(start, start + PAGE_SIZE),
    page,
    pages,
    setPage: setRequested,
    start,
  };
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="border-ink/15 bg-bone focus:border-ink/40 w-full max-w-xs rounded-full border px-4 py-2 text-[0.875rem] outline-none transition-colors duration-200"
    />
  );
}

export function Pager({
  page,
  pages,
  total,
  start,
  shown,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  start: number;
  shown: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;

  const button =
    "rounded-full border border-ink/15 px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 hover:border-ink/35 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      {/* Always say the total, so a page of fifty is never mistaken for all of them. */}
      <p className="text-ink/65 text-[0.8125rem]">
        {start + 1} to {start + shown} of {total}
      </p>

      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={button}
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
          >
            Previous
          </button>
          <span className="text-ink/65 text-[0.8125rem]">
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            className={button}
            onClick={() => onPage(page + 1)}
            disabled={page >= pages - 1}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

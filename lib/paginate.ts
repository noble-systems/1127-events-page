/**
 * Search and paging maths for the admin lists.
 *
 * Pure and separate from the component so the off-by-one cases have tests. The
 * screens using this previously rendered every row they were given, which is
 * fine at fifty and unusable at ten thousand.
 */

export const PAGE_SIZE = 50;

export function searchRows<T>(
  rows: readonly T[],
  query: string,
  haystack: (row: T) => Array<string | undefined>,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows as T[];
  return (rows as T[]).filter((row) =>
    haystack(row).some((field) => field?.toLowerCase().includes(needle)),
  );
}

export type Page = { page: number; pages: number; start: number };

/**
 * Resolves a requested page against a total.
 *
 * Clamps rather than trusting the request. A search that shortens the list can
 * leave the requested page past the end, and correcting that afterwards in an
 * effect means rendering the empty page first and then re-rendering. Clamping
 * on read means the out-of-range page simply never displays.
 *
 * An empty list is one page, not zero, so the UI always has a page to show.
 */
export function pageOf(
  total: number,
  requested: number,
  size: number = PAGE_SIZE,
): Page {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(Math.trunc(requested) || 0, 0), pages - 1);
  return { page, pages, start: page * size };
}

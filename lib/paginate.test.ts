import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PAGE_SIZE, pageOf, searchRows } from "./paginate.ts";

describe("pageOf", () => {
  test("an empty list is one page, not zero", () => {
    // The UI always needs a page to render, and 0 of 0 reads as broken.
    assert.deepEqual(pageOf(0, 0), { page: 0, pages: 1, start: 0 });
  });

  test("a partial last page still counts", () => {
    assert.equal(pageOf(101, 0, 50).pages, 3);
    assert.equal(pageOf(100, 0, 50).pages, 2);
    assert.equal(pageOf(1, 0, 50).pages, 1);
  });

  test("ten thousand people page cleanly", () => {
    const { pages } = pageOf(10_000, 0);
    assert.equal(pages, 10_000 / PAGE_SIZE);
    assert.equal(pageOf(10_000, 199).start, 199 * PAGE_SIZE);
  });

  test("a page past the end clamps to the last one", () => {
    // The case that happens in practice: you are on page 40, you type a search
    // that matches three people, and the page you asked for no longer exists.
    assert.deepEqual(pageOf(3, 40, 50), { page: 0, pages: 1, start: 0 });
    assert.equal(pageOf(120, 99, 50).page, 2);
  });

  test("a negative or junk page clamps to the first", () => {
    assert.equal(pageOf(120, -5, 50).page, 0);
    assert.equal(pageOf(120, NaN, 50).page, 0);
    assert.equal(pageOf(120, 1.7, 50).page, 1);
  });
});

describe("searchRows", () => {
  const rows = [
    { name: "Alex Moreno", email: "alex@example.com" },
    { name: "Sam Reyes", email: "sam@other.test" },
    { name: "", email: "anon@example.com" },
  ];
  const fields = (r: (typeof rows)[number]) => [r.name, r.email];

  test("an empty query returns everything, untouched", () => {
    assert.equal(searchRows(rows, "   ", fields).length, 3);
  });

  test("matches either field, case-insensitively", () => {
    assert.equal(searchRows(rows, "MORENO", fields).length, 1);
    assert.equal(searchRows(rows, "example.com", fields).length, 2);
  });

  test("a missing field does not throw", () => {
    // The third row has no name; an unguarded toLowerCase would take the page
    // down rather than simply not match.
    assert.equal(searchRows(rows, "anon", fields)[0].email, "anon@example.com");
  });

  test("searches the whole set, not just the current page", () => {
    // The reason filtering runs before paging: somebody on page 40 has to be
    // findable from page 1.
    const many = Array.from({ length: 10_000 }, (_, i) => ({
      name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));
    const hit = searchRows(many, "p9999@", (r) => [r.name, r.email]);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].email, "p9999@example.com");
  });
});

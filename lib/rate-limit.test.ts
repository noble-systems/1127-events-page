import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  RATE_LIMITS,
  consume,
  evaluateWindow,
  resetLocalRateLimits,
  type RateLimitRule,
} from "./rate-limit.ts";

/**
 * The window arithmetic is where a rate limiter is actually right or wrong, so
 * it is tested directly rather than through the storage layer.
 */

const RULE: RateLimitRule = { limit: 3, windowSeconds: 60 };
const NOW = 1_700_000_000_000;

describe("evaluateWindow", () => {
  test("allows up to the limit from empty", () => {
    let stamps: number[] = [];
    for (let i = 1; i <= RULE.limit; i++) {
      const d = evaluateWindow(stamps, NOW + i, RULE);
      assert.equal(d.allowed, true, `request ${i} should be allowed`);
      stamps = d.timestamps;
    }
    assert.equal(stamps.length, RULE.limit);
  });

  test("denies the one after the limit", () => {
    const stamps = [NOW - 3000, NOW - 2000, NOW - 1000];
    const d = evaluateWindow(stamps, NOW, RULE);
    assert.equal(d.allowed, false);
    assert.equal(d.remaining, 0);
    assert.ok(d.retryAfterSeconds > 0);
  });

  test("remaining counts down honestly", () => {
    assert.equal(evaluateWindow([], NOW, RULE).remaining, 2);
    assert.equal(evaluateWindow([NOW - 1], NOW, RULE).remaining, 1);
    assert.equal(evaluateWindow([NOW - 2, NOW - 1], NOW, RULE).remaining, 0);
  });

  test("entries older than the window do not count", () => {
    // All three are just outside a 60s window, so the window is effectively empty.
    const old = [NOW - 61_000, NOW - 62_000, NOW - 63_000];
    const d = evaluateWindow(old, NOW, RULE);
    assert.equal(d.allowed, true);
    assert.equal(d.remaining, RULE.limit - 1);
    // And they are dropped rather than carried forward, which is what keeps the
    // stored item from growing without bound.
    assert.equal(d.timestamps.length, 1);
  });

  test("it slides: capacity returns gradually, not all at once", () => {
    // Three requests spread across the window. This is the case a fixed window
    // gets wrong.
    const stamps = [NOW - 50_000, NOW - 30_000, NOW - 10_000];
    assert.equal(evaluateWindow(stamps, NOW, RULE).allowed, false);

    // 11s later the oldest has aged out, so exactly one slot frees up.
    const later = NOW + 11_000;
    const d = evaluateWindow(stamps, later, RULE);
    assert.equal(d.allowed, true);
    assert.equal(d.remaining, 0, "one slot back, not three");
  });

  test("retryAfter points at when the oldest entry expires", () => {
    const stamps = [NOW - 20_000, NOW - 10_000, NOW - 5_000];
    const d = evaluateWindow(stamps, NOW, RULE);
    // Oldest is 20s into a 60s window, so 40s remain.
    assert.equal(d.retryAfterSeconds, 40);
  });

  test("retryAfter is never zero when denied", () => {
    // Oldest is a hair under the boundary: rounding must not produce 0.
    const stamps = [NOW - 59_999, NOW - 100, NOW - 50];
    const d = evaluateWindow(stamps, NOW, RULE);
    assert.equal(d.allowed, false);
    assert.ok(d.retryAfterSeconds >= 1, `got ${d.retryAfterSeconds}`);
  });

  test("the boundary is exclusive, so an entry exactly at the cutoff is out", () => {
    const exactly = NOW - RULE.windowSeconds * 1000;
    const d = evaluateWindow([exactly, exactly, exactly], NOW, RULE);
    assert.equal(d.allowed, true, "entries exactly at the cutoff have expired");
  });

  test("future timestamps are ignored rather than trusted", () => {
    // Clock skew between Lambda instances must not hand out free capacity, and
    // must not lock someone out until the far future either.
    const skewed = [NOW + 10_000, NOW + 20_000, NOW + 30_000];
    const d = evaluateWindow(skewed, NOW, RULE);
    assert.equal(d.allowed, true);
    assert.equal(d.timestamps.length, 1, "the bogus entries are discarded");
  });

  test("junk stored values cannot break the decision", () => {
    const junk = [NaN, Infinity, -Infinity] as number[];
    const d = evaluateWindow(junk, NOW, RULE);
    assert.equal(d.allowed, true);
    assert.deepEqual(d.timestamps, [NOW]);
  });

  test("unordered input is handled", () => {
    const shuffled = [NOW - 5_000, NOW - 50_000, NOW - 30_000];
    const d = evaluateWindow(shuffled, NOW, RULE);
    assert.equal(d.allowed, false);
    // retryAfter must be based on the genuinely oldest entry, not the first one
    // in the array.
    assert.equal(d.retryAfterSeconds, 10);
  });

  test("a limit of one behaves sanely", () => {
    const once: RateLimitRule = { limit: 1, windowSeconds: 30 };
    const first = evaluateWindow([], NOW, once);
    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 0);
    assert.equal(evaluateWindow(first.timestamps, NOW + 1, once).allowed, false);
    assert.equal(
      evaluateWindow(first.timestamps, NOW + 30_001, once).allowed,
      true,
    );
  });
});

describe("configured rules", () => {
  test("login is limited more tightly than the public form", () => {
    // Each login request emails a real person, and a login endpoint is the
    // higher-value target. If this ever inverts, it is a mistake.
    assert.ok(RATE_LIMITS.loginRequest.limit < RATE_LIMITS.form.limit);
  });

  test("every rule is positive and finite", () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      assert.ok(rule.limit > 0, `${name} limit`);
      assert.ok(rule.windowSeconds > 0, `${name} window`);
      assert.ok(Number.isFinite(rule.limit), `${name} limit finite`);
    }
  });
});

describe("consume, against the development fallback", () => {
  afterEach(() => resetLocalRateLimits());

  test("blocks after the configured number of form posts", async () => {
    const key = "198.51.100.7";
    const limit = RATE_LIMITS.form.limit;

    for (let i = 1; i <= limit; i++) {
      const r = await consume("form", key);
      assert.equal(r.allowed, true, `post ${i} of ${limit}`);
    }

    const blocked = await consume("form", key);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds > 0);
    assert.equal(blocked.limit, limit);
  });

  test("separate keys do not share an allowance", async () => {
    for (let i = 0; i < RATE_LIMITS.form.limit; i++) {
      await consume("form", "203.0.113.1");
    }
    assert.equal((await consume("form", "203.0.113.1")).allowed, false);
    assert.equal(
      (await consume("form", "203.0.113.2")).allowed,
      true,
      "a different address must be unaffected",
    );
  });

  test("separate buckets do not share an allowance", async () => {
    const key = "198.51.100.9";
    for (let i = 0; i < RATE_LIMITS.form.limit; i++) {
      await consume("form", key);
    }
    assert.equal((await consume("form", key)).allowed, false);
    assert.equal(
      (await consume("loginRequest", key)).allowed,
      true,
      "the same address hitting login is a different bucket",
    );
  });

  test("a denied request does not consume capacity", async () => {
    const key = "198.51.100.11";
    const rule = RATE_LIMITS.loginRequest;
    const start = Date.now();

    for (let i = 0; i < rule.limit; i++) await consume("loginRequest", key, start);

    const first = await consume("loginRequest", key, start);
    const second = await consume("loginRequest", key, start);
    // If denials were recorded, retryAfter would keep climbing.
    assert.equal(first.allowed, false);
    assert.equal(second.retryAfterSeconds, first.retryAfterSeconds);
  });

  test("capacity comes back once the window passes", async () => {
    const key = "198.51.100.13";
    const rule = RATE_LIMITS.loginRequest;
    const start = Date.now();

    for (let i = 0; i < rule.limit; i++) await consume("loginRequest", key, start);
    assert.equal((await consume("loginRequest", key, start)).allowed, false);

    const afterWindow = start + rule.windowSeconds * 1000 + 1;
    assert.equal((await consume("loginRequest", key, afterWindow)).allowed, true);
  });
});

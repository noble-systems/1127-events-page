import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  campaignKey,
  countryKey,
  dayKey,
  isBotAgent,
  lastDays,
  metricPk,
  normalisePath,
  parseMetricPk,
  refererHost,
} from "./analytics.ts";

describe("normalisePath", () => {
  test("keeps real pages, strips query and hash, collapses slashes", () => {
    assert.equal(normalisePath("/"), "/");
    assert.equal(normalisePath("/rsvp/mirage-at-solaya"), "/rsvp/mirage-at-solaya");
    assert.equal(normalisePath("/rsvp?utm_source=ig#top"), "/rsvp");
    assert.equal(normalisePath("/partner/"), "/partner");
  });

  test("refuses what must never be counted", () => {
    // Admin and API traffic is nobody's business, including ours; the rest is
    // junk that would pollute the counters or worse.
    for (const path of [
      "/admin",
      "/admin/events",
      "/api/beacon",
      "/_next/static/x",
      "/a/../b",
      "http://evil.example/",
      "not-a-path",
      "",
      "/" + "x".repeat(300),
    ]) {
      assert.equal(normalisePath(path), null, `accepted "${path.slice(0, 40)}"`);
    }
  });
});

describe("refererHost", () => {
  test("reduces to a bare host and drops our own", () => {
    assert.equal(refererHost("https://www.instagram.com/p/abc", "1127.events"), "instagram.com");
    assert.equal(refererHost("https://1127.events/rsvp", "1127.events"), null);
    assert.equal(refererHost("https://www.1127.events/", "1127.events"), null);
  });

  test("junk referrers are dropped, not stored", () => {
    assert.equal(refererHost("not a url", "1127.events"), null);
    assert.equal(refererHost("", "1127.events"), null);
    assert.equal(refererHost(null, "1127.events"), null);
  });
});

describe("campaignKey", () => {
  test("source and campaign combine; either alone still counts", () => {
    assert.equal(campaignKey({ utmSource: "ig", utmCampaign: "aug-date" }), "ig/aug-date");
    assert.equal(campaignKey({ utmSource: "ig" }), "ig/unknown");
    assert.equal(campaignKey({ utmCampaign: "aug-date" }), "unknown/aug-date");
    assert.equal(campaignKey({}), null);
  });
});

describe("isBotAgent", () => {
  test("obvious crawlers and preview fetchers are not visitors", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "facebookexternalhit/1.1",
      "curl/8.4.0",
      "python-requests/2.31",
      "HeadlessChrome/120",
      null,
      "",
    ]) {
      assert.equal(isBotAgent(ua), true, `passed "${ua}"`);
    }
  });

  test("real browsers pass", () => {
    assert.equal(
      isBotAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
      false,
    );
  });
});

describe("keys and ranges", () => {
  test("metric keys round-trip", () => {
    const pk = metricPk("path", "2026-08-04", "/rsvp");
    assert.deepEqual(parseMetricPk(pk), { kind: "path", day: "2026-08-04", key: "/rsvp" });
    assert.equal(parseMetricPk("form#1.2.3.4"), null, "rate-limit rows must not parse");
    assert.equal(parseMetricPk("m#bogus#2026-08-04#x"), null);
  });

  test("countryKey accepts ISO pairs only", () => {
    assert.equal(countryKey("us"), "US");
    assert.equal(countryKey("USA"), null);
    assert.equal(countryKey(null), null);
  });

  test("lastDays ends today and counts back", () => {
    const now = new Date("2026-08-04T12:00:00Z");
    const days = lastDays(3, now);
    assert.deepEqual(days, ["2026-08-02", "2026-08-03", "2026-08-04"]);
    assert.equal(dayKey(now), "2026-08-04");
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ALLOW_ALL,
  CONSENT_VERSION,
  DENY_ALL,
  allows,
  decodeConsent,
  encodeConsent,
} from "./consent.ts";

describe("encode / decode", () => {
  test("round-trips every combination", () => {
    for (const analytics of [true, false]) {
      for (const marketing of [true, false]) {
        const state = { necessary: true, analytics, marketing } as const;
        assert.deepEqual(decodeConsent(encodeConsent(state)), state);
      }
    }
  });

  test("stays small enough to send on every request", () => {
    assert.ok(encodeConsent(ALLOW_ALL).length <= 8);
  });

  test("necessary is always on, even when the cookie says otherwise", () => {
    const decoded = decodeConsent(encodeConsent(DENY_ALL));
    assert.equal(decoded?.necessary, true);
  });
});

describe("decode rejects anything it cannot trust", () => {
  test("malformed values", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "   ",
      "yes",
      "1.1",
      "1.1.1.1",
      "1..1",
      "a.b.c",
      "1.-1.0",
      "1.2.0", // out of range
      "1.0.2",
    ]) {
      assert.equal(
        decodeConsent(raw as string),
        null,
        `accepted ${JSON.stringify(raw)}`,
      );
    }
  });

  test("a cookie from an older policy version re-asks", () => {
    assert.equal(decodeConsent(`${CONSENT_VERSION + 1}.1.1`), null);
    assert.equal(decodeConsent("0.1.1"), null);
  });

  test("tolerates surrounding whitespace", () => {
    assert.deepEqual(decodeConsent(`  ${CONSENT_VERSION}.1.0  `), {
      necessary: true,
      analytics: true,
      marketing: false,
    });
  });
});

describe("allows", () => {
  test("necessary is permitted even with no choice recorded", () => {
    assert.equal(allows(null, "necessary"), true);
    assert.equal(allows(DENY_ALL, "necessary"), true);
  });

  test("no choice means no permission for anything else", () => {
    assert.equal(allows(null, "analytics"), false);
    assert.equal(allows(null, "marketing"), false);
  });

  test("reflects the recorded choice", () => {
    assert.equal(allows(ALLOW_ALL, "analytics"), true);
    assert.equal(allows(ALLOW_ALL, "marketing"), true);
    assert.equal(allows(DENY_ALL, "analytics"), false);
    assert.equal(
      allows({ necessary: true, analytics: true, marketing: false }, "marketing"),
      false,
    );
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hasRealSecret,
  readUnsubscribeToken,
  signToken,
  unsubscribeToken,
  verifyToken,
} from "./tokens.ts";

describe("signToken / verifyToken", () => {
  test("round-trips claims", () => {
    const token = signToken({ e: "a@b.co", n: 42 });
    assert.deepEqual(verifyToken(token), { e: "a@b.co", n: 42 });
  });

  test("rejects a tampered payload", () => {
    const token = signToken({ e: "a@b.co" });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ e: "evil@b.co" })).toString(
      "base64url",
    )}.${signature}`;
    assert.equal(verifyToken(forged), null);
  });

  test("rejects a tampered signature", () => {
    const token = signToken({ e: "a@b.co" });
    assert.equal(verifyToken(`${token.split(".")[0]}.deadbeef`), null);
  });

  test("rejects malformed input", () => {
    for (const bad of ["", ".", "nodot", "a.b.c.d"]) {
      assert.equal(verifyToken(bad), null, `expected "${bad}" to be rejected`);
    }
  });
});

describe("unsubscribe tokens", () => {
  test("survives emails containing dots and @", () => {
    // The original dev-session bug: a '.'-delimited token broke on these.
    for (const email of [
      "daniel@1127.events",
      "first.last@sub.domain.co.uk",
      "a+tag@b.io",
    ]) {
      assert.equal(readUnsubscribeToken(unsubscribeToken(email)), email);
    }
  });

  test("normalises case and whitespace", () => {
    assert.equal(
      readUnsubscribeToken(unsubscribeToken("  Daniel@1127.Events ")),
      "daniel@1127.events",
    );
  });

  test("refuses a token minted for a different action", () => {
    const other = signToken({ e: "a@b.co", a: "something-else" });
    assert.equal(readUnsubscribeToken(other), null);
  });
});

describe("hasRealSecret", () => {
  test("is false for the built-in development key and short values", () => {
    const original = process.env.APP_SECRET;
    try {
      delete process.env.APP_SECRET;
      assert.equal(hasRealSecret(), false);

      process.env.APP_SECRET = "short";
      assert.equal(hasRealSecret(), false);

      process.env.APP_SECRET = "1127-local-development-secret";
      assert.equal(hasRealSecret(), false);

      process.env.APP_SECRET = "a".repeat(32);
      assert.equal(hasRealSecret(), true);
    } finally {
      if (original === undefined) delete process.env.APP_SECRET;
      else process.env.APP_SECRET = original;
    }
  });
});

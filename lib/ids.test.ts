import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fromUrlId, toUrlId } from "./ids.ts";

describe("submission url ids", () => {
  test("round-trips every key shape we generate", () => {
    for (const pk of [
      "rsvp#dana.ruiz@example.com",
      "talent#3f2a9c1e-0b44-4e91-9a77-2c5d1f8e6b03",
      "ambassador#00000000-0000-0000-0000-000000000000",
      "partner#jo+tag@the-deck.co.uk",
    ]) {
      assert.equal(fromUrlId(toUrlId(pk)), pk, `failed for ${pk}`);
    }
  });

  test("produces path-safe output, no #, @, / or +", () => {
    const id = toUrlId("rsvp#a+b/c@example.com");
    assert.match(id, /^[A-Za-z0-9_-]+$/);
    assert.equal(encodeURIComponent(id), id, "should need no escaping");
  });

  test("survives non-ASCII addresses", () => {
    const pk = "rsvp#josé@café.example";
    assert.equal(fromUrlId(toUrlId(pk)), pk);
  });

  test("rejects malformed or hostile input", () => {
    for (const bad of [
      "",
      "not base64!",
      "../../etc/passwd",
      "%2e%2e",
      toUrlId("no-hash-so-not-a-key"),
    ]) {
      assert.equal(fromUrlId(bad), null, `expected "${bad}" to be rejected`);
    }
  });

  test("rejects a padded or mutated id rather than guessing", () => {
    const id = toUrlId("rsvp#a@b.co");
    assert.equal(fromUrlId(`${id}=`), null);
  });
});

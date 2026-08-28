import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { authMode, maskEmail } from "./auth-policy.ts";

/**
 * The parts of the auth layer that can be tested without a live Cognito pool:
 * the mode interlock that keeps development sign-in out of production, and the
 * address masking shown back to whoever asked for a code.
 */

describe("authMode", () => {
  const original = {
    pool: process.env.COGNITO_USER_POOL_ID,
    client: process.env.COGNITO_CLIENT_ID,
    env: process.env.NODE_ENV,
  };

  const setNodeEnv = (value: string | undefined) => {
    // NODE_ENV is readonly in the Next types, but this is a test process.
    if (value === undefined)
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = value;
  };

  afterEach(() => {
    if (original.pool === undefined) delete process.env.COGNITO_USER_POOL_ID;
    else process.env.COGNITO_USER_POOL_ID = original.pool;
    if (original.client === undefined) delete process.env.COGNITO_CLIENT_ID;
    else process.env.COGNITO_CLIENT_ID = original.client;
    setNodeEnv(original.env);
  });

  test("uses cognito when a pool and client are configured", () => {
    process.env.COGNITO_USER_POOL_ID = "us-west-2_example";
    process.env.COGNITO_CLIENT_ID = "exampleclientid";
    assert.equal(authMode(), "cognito");
  });

  test("falls back to dev sign-in only outside production", () => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
    setNodeEnv("development");
    assert.equal(authMode(), "dev");
  });

  test("NEVER allows dev sign-in in production", () => {
    // This is the interlock that stops a misconfigured deploy from exposing a
    // console-printed login code as a way into the dashboard. If this test ever
    // fails, the dashboard is open.
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
    setNodeEnv("production");
    assert.equal(authMode(), "unconfigured");
    assert.notEqual(authMode(), "dev");
  });

  test("a half-configured pool does not count as cognito", () => {
    // Pool set but no client, or the reverse, would fail at the API call. It
    // must not be treated as a working cognito setup.
    setNodeEnv("production");
    process.env.COGNITO_USER_POOL_ID = "us-west-2_example";
    delete process.env.COGNITO_CLIENT_ID;
    assert.equal(authMode(), "unconfigured");

    delete process.env.COGNITO_USER_POOL_ID;
    process.env.COGNITO_CLIENT_ID = "exampleclientid";
    assert.equal(authMode(), "unconfigured");
  });
});

describe("maskEmail", () => {
  test("keeps the first character and the domain", () => {
    assert.equal(maskEmail("daniel@1127.events"), "d*****@1127.events");
  });

  test("masks a short local part without leaking its length as zero", () => {
    assert.equal(maskEmail("a@1127.events"), "a*@1127.events");
  });

  test("never returns the full address", () => {
    for (const address of [
      "daniel@1127.events",
      "ethan@1127.events",
      "someone.long.here@example.com",
    ]) {
      const masked = maskEmail(address);
      assert.notEqual(masked, address);
      // The domain is fine to show: it confirms the right inbox without
      // revealing the account name to whoever typed it.
      assert.ok(masked.endsWith(address.slice(address.indexOf("@"))));
      assert.ok(masked.includes("*"));
    }
  });

  test("degrades safely on input that is not an address", () => {
    for (const junk of ["", "not-an-address", "@leading"]) {
      assert.equal(maskEmail(junk), "your email", `for "${junk}"`);
    }
  });
});

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, self-contained tokens for links we email out (currently just
 * unsubscribe). Format: `<base64url(payload)>.<hmac>`.
 *
 * The payload is encoded rather than interpolated so values containing "." or
 * "@", i.e. every email address, survive the round trip intact.
 */

const DEV_SECRET = "1127-local-development-secret";

export function appSecret(): string {
  return process.env.APP_SECRET ?? DEV_SECRET;
}

/**
 * True when APP_SECRET is a real, deployment-specific value. Guest email is
 * held back until this is set, because an unsubscribe link signed with a
 * publicly-known development key could be forged by anyone.
 */
export function hasRealSecret(): boolean {
  const secret = process.env.APP_SECRET;
  return Boolean(secret && secret !== DEV_SECRET && secret.length >= 16);
}

function sign(payload: string): string {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function signToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken<T = Record<string, unknown>>(token: string): T | null {
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;

  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Unsubscribe tokens don't expire, an old email must still be able to opt out. */
export function unsubscribeToken(email: string): string {
  return signToken({ e: email.trim().toLowerCase(), a: "unsubscribe" });
}

export function readUnsubscribeToken(token: string): string | null {
  const claims = verifyToken<{ e?: unknown; a?: unknown }>(token);
  if (!claims || claims.a !== "unsubscribe") return null;
  return typeof claims.e === "string" ? claims.e : null;
}

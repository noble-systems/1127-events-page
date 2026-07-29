/**
 * Auth decisions that involve no IO.
 *
 * Split out from lib/auth.ts so they can be unit tested: auth.ts imports
 * next/headers for cookie access, which the bare Node test runner cannot
 * resolve. The interlock below is the single most important thing in the auth
 * layer to have covered, so it lives where tests can reach it.
 */

export type AuthMode = "cognito" | "dev" | "unconfigured";

/**
 * Which sign-in path is active.
 *
 * The "dev" mode prints login codes to the server console instead of emailing
 * them. That is a convenience locally and a wide open door in production, so
 * this function is the interlock: a deployed build with a missing Cognito
 * configuration returns "unconfigured" and refuses to sign anyone in, rather
 * than silently falling back to something usable.
 *
 * Both variables are required for "cognito". A half-configured pool would fail
 * at the API call anyway, and treating it as working would mean falling through
 * to the dev path on a misconfigured deploy.
 */
export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  if (env.COGNITO_USER_POOL_ID && env.COGNITO_CLIENT_ID) return "cognito";
  if (env.NODE_ENV !== "production") return "dev";
  return "unconfigured";
}

/**
 * "daniel@1127.events" -> "d*****@1127.events"
 *
 * Shown back after a code is sent, so the recipient can tell it went to the
 * right inbox. The domain is deliberately left intact: it confirms the mailbox
 * without echoing the account name to whoever typed it, which matters because
 * this endpoint answers identically for addresses that do not exist.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "your email";
  const first = email.slice(0, 1);
  const domain = email.slice(at);
  return `${first}${"*".repeat(Math.max(1, at - 1))}${domain}`;
}

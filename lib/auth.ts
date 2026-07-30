import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";
import { authMode, maskEmail, type AuthMode } from "./auth-policy.ts";

// Re-exported so callers can keep importing from "@/lib/auth".
export { authMode, maskEmail };
export type { AuthMode };

/**
 * Admin authentication
 * ====================
 *
 * Passwordless. Staff enter an email address, Cognito emails a numeric code,
 * and the code is exchanged for an access token stored in an HTTP-only cookie
 * and verified against the pool's JWKS on every admin request.
 *
 * There is no admin password anywhere in this system. That removes a whole
 * category of problem: nothing to phish, reuse across sites, leak in a paste,
 * or rotate. The tradeoff is that sign-in depends on email delivery working,
 * which is why the pool sends through SES on our own verified domain rather
 * than Cognito's default sender.
 *
 * Production  → Cognito USER_AUTH flow with EMAIL_OTP.
 *
 * Development → if no Cognito pool is configured AND NODE_ENV is not
 *               "production", the code is printed to the server console instead
 *               of emailed, and a local HMAC-signed cookie is issued. This path
 *               is impossible in production: see `authMode()` below.
 */

export const SESSION_COOKIE = "1127_admin";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

const USER_POOL_ID = () => process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = () => process.env.COGNITO_CLIENT_ID;
const REGION = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

export type AdminUser = { email: string; via: AuthMode };

/** Result of asking for a login code. */
export type CodeRequestResult =
  | { status: "code-sent"; session: string; destination?: string }
  | { status: "error"; message: string };

/** Result of submitting a login code. */
export type CodeVerifyResult =
  | { status: "ok"; token: string }
  | { status: "error"; message: string; retryable: boolean };

/* -------------------------------------------------------------------------- */
/* Cognito                                                                     */
/* -------------------------------------------------------------------------- */

let cognito: CognitoIdentityProviderClient | null = null;
function cognitoClient() {
  if (!cognito) {
    cognito = new CognitoIdentityProviderClient({ region: REGION() });
  }
  return cognito;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
function jwtVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID() as string,
      tokenUse: "access",
      clientId: CLIENT_ID() as string,
    });
  }
  return verifier;
}

/* -------------------------------------------------------------------------- */
/* Development-only signed cookie                                              */
/* -------------------------------------------------------------------------- */

function devSecret(): string {
  return process.env.DEV_ADMIN_SECRET ?? "1127-local-development-secret";
}

function devSign(payload: string): string {
  return createHmac("sha256", devSecret()).update(payload).digest("base64url");
}

/**
 * `<base64url(payload)>.<signature>`
 *
 * The payload is base64url encoded rather than interpolated raw: email
 * addresses contain dots and "@", which would otherwise break the delimiter
 * and get percent-encoded on the way into the cookie.
 */
function devIssue(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${devSign(payload)}`;
}

/**
 * Development stand-in for Cognito's emailed code.
 *
 * No email is sent locally; the code is printed to the server console instead.
 * Single process, in-memory, five minute expiry, one attempt tracked per
 * session, all of which is fine because `authMode()` cannot return "dev" in a
 * production build.
 */
const devCodes = new Map<
  string,
  { code: string; expires: number; valid: boolean }
>();

function devNewCodeSession(email: string, valid: boolean): string {
  const session = `dev-${createHmac("sha256", devSecret()).update(`${email}:${Date.now()}`).digest("base64url").slice(0, 24)}`;
  const code = String(Math.floor(100000 + (Date.now() % 900000))).slice(0, 6);
  devCodes.set(session, { code, expires: Date.now() + 5 * 60 * 1000, valid });

  // Prune so a long dev session does not accumulate entries.
  for (const [key, entry] of devCodes) {
    if (entry.expires < Date.now()) devCodes.delete(key);
  }

  console.info(
    valid
      ? `[1127] dev login code for ${email}: ${code}`
      : `[1127] dev login code issued for unknown address ${email} (will not work): ${code}`,
  );
  return session;
}

function devCheckCode(session: string, code: string): boolean {
  const entry = devCodes.get(session);
  if (!entry) return false;
  if (entry.expires < Date.now()) {
    devCodes.delete(session);
    return false;
  }
  if (!entry.valid) return false;

  const a = Buffer.from(entry.code);
  const b = Buffer.from(code);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  // One shot, matching Cognito: a used or wrong code does not get a second try
  // on the same session.
  if (ok) devCodes.delete(session);
  return ok;
}

function devVerify(token: string): string | null {
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;

  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);

  const a = Buffer.from(signature);
  const b = Buffer.from(devSign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: unknown; exp?: unknown };

    if (typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Step one: ask Cognito to email a login code.
 *
 * Cognito decides the length, and it is 8 digits, not the 6 that most of the
 * documentation implies. Nothing here asserts a length: the input accepts up to
 * 8 and the form only requires enough characters to be a plausible attempt, so
 * a change at Cognito's end cannot lock everybody out.
 *
 * Deliberately returns the same shape whether or not the address belongs to a
 * real account. Saying "no such user" here would turn this endpoint into a way
 * to enumerate who works here, and Cognito's PreventUserExistenceErrors exists
 * for the same reason. The caller is told a code was sent either way.
 */
export async function requestLoginCode(email: string): Promise<CodeRequestResult> {
  const mode = authMode();
  const address = email.trim().toLowerCase();

  if (mode === "unconfigured") {
    return {
      status: "error",
      message:
        "Admin sign-in is not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID.",
    };
  }

  if (mode === "dev") {
    const allowed = (
      process.env.DEV_ADMIN_EMAIL ?? "admin@1127.local"
    ).toLowerCase();
    // Still issue a session for an unknown address so local behaviour matches
    // production, but only a code for the configured one will work.
    const session = devNewCodeSession(address, address === allowed);
    return { status: "code-sent", session, destination: maskEmail(address) };
  }

  try {
    const result = await cognitoClient().send(
      new InitiateAuthCommand({
        // The choice-based flow. EMAIL_OTP is requested explicitly so Cognito
        // sends the code immediately rather than replying with a list of
        // available factors and waiting to be asked again.
        AuthFlow: "USER_AUTH",
        ClientId: CLIENT_ID(),
        AuthParameters: {
          USERNAME: address,
          PREFERRED_CHALLENGE: "EMAIL_OTP",
        },
      }),
    );

    if (result.Session) {
      return {
        status: "code-sent",
        session: result.Session,
        // Our own masking rather than Cognito's CODE_DELIVERY_DESTINATION.
        // Cognito returns "d***@1***", which hides the domain and so fails at
        // the one job this string has: letting someone confirm the code went to
        // the right mailbox. Ours keeps the domain and masks the local part.
        destination: maskEmail(address),
      };
    }

    // No session and no challenge means Cognito would not start the flow. Most
    // often the account does not exist, which we do not disclose.
    console.warn("[1127] USER_AUTH returned no session", result.ChallengeName);
    return { status: "error", message: "Could not start sign-in. Try again." };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "UserNotFoundException" || name === "NotAuthorizedException") {
      // Same non-answer as the success path, so timing aside, the response does
      // not reveal whether the address is real.
      return {
        status: "code-sent",
        session: "",
        destination: maskEmail(address),
      };
    }
    if (name === "TooManyRequestsException" || name === "LimitExceededException") {
      return {
        status: "error",
        message: "Too many attempts. Wait a few minutes and try again.",
      };
    }
    console.error("[1127] could not send login code", error);
    return {
      status: "error",
      message: "Could not reach the sign-in service. Please try again.",
    };
  }
}

/** Step two: exchange the emailed code for a session. */
export async function verifyLoginCode(
  email: string,
  code: string,
  session: string,
): Promise<CodeVerifyResult> {
  const mode = authMode();
  const address = email.trim().toLowerCase();
  const digits = code.replace(/\s/g, "");

  if (mode === "unconfigured") {
    return {
      status: "error",
      message: "Admin sign-in is not configured.",
      retryable: false,
    };
  }

  if (mode === "dev") {
    const ok = devCheckCode(session, digits);
    return ok
      ? { status: "ok", token: devIssue(address) }
      : {
          status: "error",
          message: "That code is not right, or it has expired.",
          retryable: true,
        };
  }

  if (!session) {
    // The request step declined to say the account was unknown, so the failure
    // surfaces here instead, still without confirming anything.
    return {
      status: "error",
      message: "That code is not right, or it has expired.",
      retryable: true,
    };
  }

  try {
    const result = await cognitoClient().send(
      new RespondToAuthChallengeCommand({
        ChallengeName: "EMAIL_OTP",
        ClientId: CLIENT_ID(),
        Session: session,
        ChallengeResponses: {
          USERNAME: address,
          EMAIL_OTP_CODE: digits,
        },
      }),
    );

    const token = result.AuthenticationResult?.AccessToken;
    if (!token) {
      return {
        status: "error",
        message: "That code is not right, or it has expired.",
        retryable: true,
      };
    }
    return { status: "ok", token };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "CodeMismatchException") {
      return {
        status: "error",
        message: "That code is not right. Check the email and try again.",
        retryable: true,
      };
    }
    if (name === "ExpiredCodeException" || name === "NotAuthorizedException") {
      // Cognito invalidates the session after too many wrong guesses, so the
      // honest instruction is to start over rather than keep typing.
      return {
        status: "error",
        message: "That code has expired. Request a new one.",
        retryable: false,
      };
    }
    console.error("[1127] could not verify login code", error);
    return {
      status: "error",
      message: "Could not reach the sign-in service. Please try again.",
      retryable: true,
    };
  }
}

export async function startSession(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in admin, or null. Never throws. */
export async function currentAdmin(): Promise<AdminUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const mode = authMode();

  if (mode === "dev") {
    const email = devVerify(token);
    return email ? { email, via: "dev" } : null;
  }

  if (mode !== "cognito") return null;

  try {
    const payload = await jwtVerifier().verify(token);
    const email =
      (payload as { username?: string; sub?: string }).username ??
      (payload as { sub?: string }).sub ??
      "admin";
    return { email, via: "cognito" };
  } catch {
    return null;
  }
}

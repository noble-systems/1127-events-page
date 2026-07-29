import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";

/**
 * Admin authentication
 * ====================
 *
 * Production  → Amazon Cognito user pool. Sign-in exchanges email + password
 *               for an access token, which is stored in an HTTP-only cookie
 *               and verified against the pool's JWKS on every admin request.
 *
 * Development → if no Cognito pool is configured AND NODE_ENV is not
 *               "production", a local HMAC-signed cookie is issued instead so
 *               the dashboard can be built and reviewed before any AWS
 *               resources exist. This path is impossible in production: see
 *               `authMode()` below.
 */

export const SESSION_COOKIE = "1127_admin";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

const USER_POOL_ID = () => process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = () => process.env.COGNITO_CLIENT_ID;
const REGION = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-2";

export type AuthMode = "cognito" | "dev" | "unconfigured";

export function authMode(): AuthMode {
  if (USER_POOL_ID() && CLIENT_ID()) return "cognito";
  // Never fall back to dev auth in a deployed environment.
  if (process.env.NODE_ENV !== "production") return "dev";
  return "unconfigured";
}

export type AdminUser = { email: string; via: AuthMode };

export type SignInResult =
  | { status: "ok"; token: string }
  | { status: "new-password-required"; session: string }
  | { status: "error"; message: string };

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

export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  const mode = authMode();

  if (mode === "unconfigured") {
    return {
      status: "error",
      message:
        "Admin sign-in is not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID.",
    };
  }

  if (mode === "dev") {
    const expectedEmail = process.env.DEV_ADMIN_EMAIL ?? "admin@1127.local";
    const expectedPassword = process.env.DEV_ADMIN_PASSWORD ?? "1127-dev";

    if (email.trim().toLowerCase() !== expectedEmail.toLowerCase()) {
      return { status: "error", message: "Email or password is incorrect." };
    }
    const a = Buffer.from(password);
    const b = Buffer.from(expectedPassword);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { status: "error", message: "Email or password is incorrect." };
    }

    return { status: "ok", token: devIssue(expectedEmail) };
  }

  try {
    const result = await cognitoClient().send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CLIENT_ID(),
        AuthParameters: { USERNAME: email.trim(), PASSWORD: password },
      }),
    );

    if (result.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      return {
        status: "new-password-required",
        session: result.Session as string,
      };
    }

    const token = result.AuthenticationResult?.AccessToken;
    if (!token) {
      return { status: "error", message: "Sign-in failed. Please try again." };
    }

    return { status: "ok", token };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotAuthorizedException" || name === "UserNotFoundException") {
      return { status: "error", message: "Email or password is incorrect." };
    }
    if (name === "PasswordResetRequiredException") {
      return {
        status: "error",
        message: "This account needs a password reset in the Cognito console.",
      };
    }
    console.error("[1127] cognito sign-in failed", error);
    return {
      status: "error",
      message: "Could not reach the sign-in service. Please try again.",
    };
  }
}

/** Completes the forced password change Cognito requires for new users. */
export async function completeNewPassword(
  email: string,
  newPassword: string,
  session: string,
): Promise<SignInResult> {
  if (authMode() !== "cognito") {
    return { status: "error", message: "Not available in this environment." };
  }

  try {
    const result = await cognitoClient().send(
      new RespondToAuthChallengeCommand({
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        ClientId: CLIENT_ID(),
        Session: session,
        ChallengeResponses: { USERNAME: email.trim(), NEW_PASSWORD: newPassword },
      }),
    );

    const token = result.AuthenticationResult?.AccessToken;
    if (!token) {
      return { status: "error", message: "Could not set that password." };
    }
    return { status: "ok", token };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "InvalidPasswordException") {
      return {
        status: "error",
        message:
          "That password doesn't meet the policy: at least 12 characters, with upper and lower case, a number and a symbol.",
      };
    }
    console.error("[1127] new password challenge failed", error);
    return { status: "error", message: "Could not set that password." };
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

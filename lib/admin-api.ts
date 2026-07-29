import { NextResponse } from "next/server";
import { authMode, currentAdmin } from "./auth";

/**
 * Guard for every /api/admin route.
 *
 * Returns a response to send back when the caller is not a signed-in admin,
 * or null when the request may proceed. Middleware only checks that a cookie
 * exists; this is where the token is actually verified.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (authMode() === "unconfigured") {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Admin access is not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID.",
      },
      { status: 503 },
    );
  }

  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Not signed in." },
      { status: 401 },
    );
  }

  return null;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

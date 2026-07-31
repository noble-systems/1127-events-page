import { NextResponse, type NextRequest } from "next/server";

/**
 * (Named proxy per Next 16; this was middleware.ts until the convention was
 * renamed. Same behaviour.)
 *
 * Cheap gate in front of the dashboard: if there's no session cookie at all,
 * redirect straight to the sign-in page instead of rendering and then bouncing.
 *
 * This is NOT the security boundary. A cookie's presence proves nothing. The
 * token is verified against Cognito in the dashboard layout and again in every
 * /api/admin route (see lib/admin-api.ts).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("1127_admin")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin", "/admin/((?!login$|login/).*)"],
};

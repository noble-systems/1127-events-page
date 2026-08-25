import { cookies } from "next/headers";
import { signToken, verifyToken } from "./tokens.ts";
import { getDoorPass, type DoorPass } from "./door-store.ts";

/**
 * Door-staff sessions: the smallest useful identity.
 *
 * Door staff are not admins. They get a PIN the admin hands them, which
 * opens /door and nothing else: scan tickets, see verdicts. The session is a
 * signed cookie carrying the pass id and when it was issued, good for 24
 * hours, long enough for the longest night without asking anyone to type a
 * PIN at 1am with a line forming.
 *
 * Revocation is instant and server-side, because the check-in API verifies
 * the PASS on every call, not just the cookie: deactivating a pass kills it
 * everywhere, and "sign everyone out" bumps revokedAfter so cookies issued
 * before that moment stop verifying while the PIN itself keeps working for
 * a fresh login.
 */

export const DOOR_COOKIE = "1127_door";
export const DOOR_SESSION_HOURS = 24;

type DoorClaims = { door: string; iat: number };

export function mintDoorToken(passId: string, now = Date.now()): string {
  return signToken({ door: passId, iat: now });
}

/**
 * The full check: cookie signature, 24-hour window, pass still active, and
 * the pass not having had its sessions revoked since this cookie was born.
 * Returns the pass so callers can show who is working the door.
 */
export async function currentDoorPass(): Promise<DoorPass | null> {
  const jar = await cookies();
  const raw = jar.get(DOOR_COOKIE)?.value;
  if (!raw) return null;

  const claims = verifyToken<DoorClaims>(raw);
  if (!claims || typeof claims.door !== "string" || typeof claims.iat !== "number") {
    return null;
  }
  if (Date.now() - claims.iat > DOOR_SESSION_HOURS * 60 * 60 * 1000) return null;

  const pass = await getDoorPass(claims.door);
  if (!pass || !pass.active) return null;
  if (pass.revokedAfter && claims.iat <= pass.revokedAfter) return null;

  return pass;
}

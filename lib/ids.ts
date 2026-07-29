/**
 * URL-safe ids for submission keys.
 *
 * A submission's key is `rsvp#someone@example.com` or `talent#<uuid>`. Both
 * "#" and "@" are awkward in a path segment, percent-encoding them survives a
 * route handler but not a page's params, which is a silent 404 waiting to
 * happen. base64url has no reserved characters, so it travels intact.
 *
 * Deliberately built on `btoa`/`atob` and `TextEncoder` rather than `Buffer`:
 * these run in the browser too, and the list table links are client-rendered.
 */

export function toUrlId(pk: string): string {
  const bytes = new TextEncoder().encode(pk);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromUrlId(id: string): string | null {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;

  try {
    const binary = atob(id.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const pk = new TextDecoder().decode(bytes);

    // base64 decoding is lenient, so confirm this is exactly what was encoded
    // and looks like a real key rather than mojibake.
    return toUrlId(pk) === id && pk.includes("#") ? pk : null;
  } catch {
    return null;
  }
}

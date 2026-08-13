/**
 * Keeps an ambassador code alive for the length of one tab.
 *
 * The code arrives in a share link (?via=DANI). If the visitor wanders,
 * homepage, lineup, back to tickets, the URL param is gone by the time they
 * buy or sign up. sessionStorage bridges exactly that gap and nothing more:
 * it dies with the tab, is never sent anywhere by itself, and is not a
 * cookie, which the cookie policy promises to keep to a minimum. The
 * cookies page discloses it anyway.
 *
 * Wrapped in try/catch because storage can be blocked entirely; the link
 * param path still works without it.
 */

const KEY = "1127_via";

export function rememberVia(code: string | null | undefined): void {
  try {
    if (code) sessionStorage.setItem(KEY, code);
  } catch {
    /* storage unavailable; the URL param already did its job */
  }
}

export function recallVia(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

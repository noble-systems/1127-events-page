/**
 * Cookie consent.
 *
 * The site currently sets no advertising or analytics cookies at all, so this
 * exists for two reasons: to say so honestly, and so that the day a Meta pixel
 * or an analytics script is added it is already gated behind a real choice
 * rather than bolted on afterwards.
 *
 * Keep /cookies in step with whatever this actually controls.
 */

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentState = {
  /** Always true. Sign-in and consent itself cannot be switched off. */
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export const CONSENT_COOKIE = "1127_consent";

/**
 * Bump when the categories change meaning. An older version decodes to null,
 * which re-asks rather than silently assuming the old answer still applies.
 */
// v2: marketing stopped meaning "nothing yet" and started meaning the Meta
// Pixel actually loads. Everyone gets asked again under the honest wording.
export const CONSENT_VERSION = 2;

/** Six months, the longest most guidance considers reasonable to remember a choice. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

export const DENY_ALL: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export const ALLOW_ALL: ConsentState = {
  necessary: true,
  analytics: true,
  marketing: true,
};

/**
 * Compact on purpose: `1.1.0` is version, analytics, marketing. A cookie is
 * sent on every request, so it stays small and needs no URL encoding.
 */
export function encodeConsent(state: ConsentState): string {
  return [CONSENT_VERSION, state.analytics ? 1 : 0, state.marketing ? 1 : 0].join(
    ".",
  );
}

export function decodeConsent(raw: string | null | undefined): ConsentState | null {
  if (typeof raw !== "string") return null;

  const parts = raw.trim().split(".");
  if (parts.length !== 3) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;

  const [version, analytics, marketing] = parts.map(Number);
  if (version !== CONSENT_VERSION) return null;
  if (analytics > 1 || marketing > 1) return null;

  return {
    necessary: true,
    analytics: analytics === 1,
    marketing: marketing === 1,
  };
}

export function allows(
  state: ConsentState | null,
  category: ConsentCategory,
): boolean {
  if (category === "necessary") return true;
  if (!state) return false; // no choice yet means no permission
  return state[category];
}

export const CATEGORIES: ReadonlyArray<{
  id: ConsentCategory;
  label: string;
  body: string;
  locked?: boolean;
}> = [
  {
    id: "necessary",
    label: "Strictly necessary",
    body: "Keeps you signed in to the admin dashboard and remembers this cookie choice. Nothing here tracks you, and the site cannot work without it.",
    locked: true,
  },
  {
    id: "analytics",
    label: "Analytics",
    body: "Would tell us which pages and links actually lead to signups, in aggregate. None are in use today; our own counters are cookieless.",
  },
  {
    id: "marketing",
    label: "Marketing",
    body: "Lets the Meta (Facebook/Instagram) Pixel measure whether our ads led to a visit or a ticket, and improve who sees them. Off means it never loads.",
  },
];

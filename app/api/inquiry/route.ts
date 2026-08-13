import { NextResponse } from "next/server";
import {
  notifyAmbassador,
  notifyPartner,
  notifyRsvp,
  notifyTalent,
} from "@/lib/email";
import { consume } from "@/lib/rate-limit";
import { buildRequestMeta, clientIp } from "@/lib/request-meta";
import { notifySmsOptIn } from "@/lib/sms";
import { listPublicEvents, listSubmissions, recordSubmission } from "@/lib/store";
import { RULES, isFormType, validate, type FormValues } from "@/lib/validation";

/**
 * POST /api/inquiry
 *
 * Handles all three forms (RSVP, ambassador application, partner inquiry).
 * Payloads are re-validated here with the same rules the browser used, so a
 * crafted request can't bypass the client, then written to DynamoDB.
 *
 * RSVPs are keyed by email address, so the mailing list stays deduplicated and
 * someone signing up twice simply refreshes their record.
 */

type Payload = {
  formType?: unknown;
  values?: unknown;
  /** Page and referrer as seen by the browser. Untrusted; sanitised on read. */
  context?: { page?: unknown; referrer?: unknown };
};

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";

  // Sliding window in DynamoDB, so the limit is shared across Lambda instances
  // and survives cold starts. See lib/rate-limit.ts for why the previous
  // in-process version was not really a limit at all.
  const throttle = await consume("form", ip);
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "That's a lot of submissions. Give it a few minutes and try again.",
      },
      {
        status: 429,
        // Tells well-behaved clients exactly how long to wait instead of
        // making them guess, and it is what the spec expects on a 429.
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      },
    );
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json(
      { ok: false, message: "We couldn't read that submission. Please try again." },
      { status: 400 },
    );
  }

  const { formType, values, context } = payload;

  if (!isFormType(formType) || typeof values !== "object" || values === null) {
    return NextResponse.json(
      { ok: false, message: "That submission looked malformed. Please try again." },
      { status: 400 },
    );
  }

  const raw = values as Record<string, unknown>;

  // Honeypot: real people never fill this in.
  if (typeof raw.companyWebsite === "string" && raw.companyWebsite.trim()) {
    return NextResponse.json({ ok: true });
  }

  const clean: FormValues = {};
  for (const rule of RULES[formType]) {
    const value = raw[rule.field];
    clean[rule.field] = typeof value === "string" ? value.trim() : "";
  }

  const errors = validate(RULES[formType], clean);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      {
        ok: false,
        errors,
        message: "Please check the highlighted fields and try again.",
      },
      { status: 400 },
    );
  }

  /**
   * An ambassador code rides in from a share link. Only a real, active code
   * is worth storing; anything else is dropped rather than failing the
   * signup, because attribution is bookkeeping and the signup is the point.
   */
  if (clean.via) {
    const { activeAmbassadorCode } = await import("@/lib/ambassadors-store");
    const { normalizeAmbassadorCode } = await import("@/lib/ambassadors");
    clean.via =
      (await activeAmbassadorCode(normalizeAmbassadorCode(clean.via))) ?? "";
  }

  let outcome;
  try {
    const meta = buildRequestMeta(request.headers, context ?? {});
    outcome = await recordSubmission(formType, clean, meta);
  } catch (error) {
    console.error("[1127] could not save submission", error);
    return NextResponse.json(
      {
        ok: false,
        message: "We couldn't save that just now. Please try again in a moment.",
      },
      { status: 502 },
    );
  }

  const { record, isNew, isNewEvent } = outcome;

  // Email is best-effort and deliberately after the write: the submission is
  // already safe, so a bounced or misconfigured send must never fail the
  // request.
  //
  // An RSVP confirms when it is genuinely new to the person: their first ever
  // signup, or a signup for an event they had not signed up for before. This
  // used to be "createdAt === updatedAt", which meant somebody RSVPing for a
  // second event got silence, because RSVPs are keyed by email and their row
  // was merely updated. Signing up for a different night is not a duplicate.
  //
  // A true duplicate, the same person and the same event again, still says
  // nothing. Re-sending the same confirmation trains people to ignore them.
  const shouldConfirmRsvp = isNew || isNewEvent;
  const isFirstTime = isNew;

  try {
    if (formType === "rsvp" && shouldConfirmRsvp) {
      const [events, list] = await Promise.all([
        listPublicEvents(),
        listSubmissions("rsvp"),
      ]);
      const featured = events.find((event) => event.featured) ?? null;
      await notifyRsvp(record, featured, list.length);
    } else if (formType === "ambassador") {
      const list = await listSubmissions("ambassador");
      await notifyAmbassador(record, list.length);
    } else if (formType === "talent") {
      const list = await listSubmissions("talent");
      await notifyTalent(record, list.length);
    } else if (formType === "partner") {
      const list = await listSubmissions("partner");
      await notifyPartner(record, list.length);
    }
  } catch (error) {
    console.error("[1127] notification step failed", error);
  }

  // Text confirmation, separately from the email branch above.
  //
  // Every form treats a phone number as the text opt-in, so every form owes the
  // confirmation. Sending it only for RSVPs, as this did, meant a talent
  // applicant was recorded as opted in, never got the message naming the
  // programme, and would later receive an announcement out of nowhere. That is
  // the exact pattern carriers police, and it was invisible because the record
  // looked correct.
  //
  // Its own try/catch so a text failure cannot mask an email that did send.
  // Text confirmation follows the same rule as the email.
  if (formType === "rsvp" ? shouldConfirmRsvp : isFirstTime) {
    try {
      const events = await listPublicEvents();
      const featured = events.find((event) => event.featured) ?? null;
      await notifySmsOptIn(record, featured);
    } catch (error) {
      console.error("[1127] text confirmation failed", error);
    }
  }

  return NextResponse.json({ ok: true });
}

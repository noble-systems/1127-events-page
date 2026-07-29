import { NextResponse } from "next/server";
import {
  notifyAmbassador,
  notifyPartner,
  notifyRsvp,
  notifyTalent,
} from "@/lib/email";
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

/**
 * Best-effort throttle. This is per-instance memory, so it is a speed bump for
 * casual abuse rather than a guarantee, put a real rate limiter or a WAF in
 * front of the route if the form starts attracting traffic.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) hits.clear(); // crude memory ceiling

  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "That's a lot of submissions. Give it a few minutes and try again.",
      },
      { status: 429 },
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

  let record;
  try {
    const meta = buildRequestMeta(request.headers, context ?? {});
    record = await recordSubmission(formType, clean, meta);
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

  // Email is best-effort and deliberately after the write: the submission is
  // already safe, so a bounced or misconfigured send must never fail the
  // request. A repeat RSVP (createdAt !== updatedAt) doesn't re-notify.
  const isFirstTime = record.createdAt === record.updatedAt;

  try {
    if (formType === "rsvp" && isFirstTime) {
      const [events, list] = await Promise.all([
        listPublicEvents(),
        listSubmissions("rsvp"),
      ]);
      const featured = events.find((event) => event.featured) ?? events[0] ?? null;
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
  if (isFirstTime) {
    try {
      const events = await listPublicEvents();
      const featured = events.find((event) => event.featured) ?? events[0] ?? null;
      await notifySmsOptIn(record, featured);
    } catch (error) {
      console.error("[1127] text confirmation failed", error);
    }
  }

  return NextResponse.json({ ok: true });
}

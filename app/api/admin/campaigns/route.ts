import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { mailingList, selectAudience } from "@/lib/audience";
import { currentAdmin } from "@/lib/auth";
import {
  emailStatus,
  notifyCampaignSent,
  renderCampaignEmail,
  sendCampaignEmail,
  sendDirect,
  type CampaignInput,
} from "@/lib/email";
import { listSubmissions } from "@/lib/store";

/**
 * POST /api/admin/campaigns
 *
 *   { mode: "test", subject, heading, body, eventIds, genres }
 *   { mode: "send", subject, heading, body, eventIds, genres, offset }
 *
 * "test" renders the campaign and sends it to the signed-in admin only, with
 * the subject prefixed, so wording is checked against a real inbox before
 * anyone else sees it. The recipient is always the session's own address:
 * an endpoint that mails an arbitrary address on request is a spam relay.
 *
 * "send" goes out in batches of BATCH per request, and the client calls again
 * with the returned nextOffset until it is null. One long request would be
 * simpler, but a few hundred sequential sends outlives the platform's request
 * timeout, and dying halfway through a send is the worst possible place to die.
 * The audience is recomputed per batch; isMailable is also re-checked per
 * recipient at send time, so somebody unsubscribing mid-campaign stops
 * receiving it even if they were in the audience when it started.
 *
 * There is no stored campaign history yet. The team summary email on the final
 * batch is the paper trail: what was sent, to how many, and when.
 */

const BATCH = 40;

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as Record<string, unknown> | null;

  const mode =
    body?.mode === "send" ? "send" : body?.mode === "preview" ? "preview" : "test";
  const input: CampaignInput = {
    subject: typeof body?.subject === "string" ? body.subject.trim() : "",
    heading: typeof body?.heading === "string" ? body.heading.trim() : "",
    body: typeof body?.body === "string" ? body.body.trim() : "",
  };
  const eventIds = Array.isArray(body?.eventIds)
    ? body.eventIds.filter((v): v is string => typeof v === "string")
    : [];
  const genres = Array.isArray(body?.genres)
    ? body.genres.filter((v): v is string => typeof v === "string")
    : [];
  const offset =
    typeof body?.offset === "number" && Number.isInteger(body.offset) && body.offset >= 0
      ? body.offset
      : 0;

  if (!input.subject || input.subject.length > 120) {
    return NextResponse.json(
      { ok: false, message: "The subject is required, up to 120 characters." },
      { status: 400 },
    );
  }
  if (!input.body || input.body.length > 5000) {
    return NextResponse.json(
      { ok: false, message: "The body is required, up to 5,000 characters." },
      { status: 400 },
    );
  }
  if (input.heading.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Keep the heading under 120 characters." },
      { status: 400 },
    );
  }

  /**
   * Renders exactly what a recipient gets, with a stand-in name so {name}
   * visibly fills, and sends nothing. Same function as the real send, not a
   * lookalike: the facts-strip scramble happened because a preview normalised
   * one way and the save another, and this screen does not repeat that.
   *
   * Deliberately before the email-readiness gate, so wording can be drafted
   * before SES is even configured.
   */
  if (mode === "preview") {
    const message = renderCampaignEmail(input, {
      pk: "rsvp#preview@example.com",
      type: "rsvp",
      email: "preview@example.com",
      name: "Alex Moreno",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      mode,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  const status = emailStatus();
  if (!status.guest) {
    return NextResponse.json(
      { ok: false, message: `Email is not ready to send: ${status.detail}` },
      { status: 503 },
    );
  }

  const audience = selectAudience(mailingList(await listSubmissions()), {
    eventIds,
    genres,
  });

  if (mode === "test") {
    const admin = await currentAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
    }
    // The session identity was a Cognito UUID for weeks and nothing noticed
    // until SES refused it as an address. If it ever regresses, say so plainly
    // rather than letting SES translate it.
    if (!admin.email.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          message: `Your session identity ("${admin.email}") is not an email address. Sign out and back in.`,
        },
        { status: 500 },
      );
    }

    // A stand-in record so the test renders exactly what a real recipient gets,
    // unsubscribe link included. The link opts out the admin's own address,
    // which is the honest preview: clicking it in a test does what it says.
    const preview = renderCampaignEmail(
      { ...input, subject: `[Test] ${input.subject}` },
      {
        pk: `rsvp#${admin.email}`,
        type: "rsvp",
        email: admin.email,
        name: "Test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );

    try {
      await sendDirect({
        to: [admin.email],
        subject: preview.subject,
        html: preview.html,
        text: preview.text,
      });
    } catch (error) {
      // Admin-only endpoint, so the real reason is returned rather than a
      // guess. The first version swallowed it and answered "check the SES
      // setup", which sent whoever read it off to check the one part that
      // was fine.
      console.error("[1127] campaign test send failed", error);
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error.";
      return NextResponse.json(
        { ok: false, message: `The test send failed. ${reason}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, mode, recipients: audience.length });
  }

  if (audience.length === 0) {
    return NextResponse.json(
      { ok: false, message: "That segment has nobody mailable in it." },
      { status: 400 },
    );
  }

  const batch = audience.slice(offset, offset + BATCH);
  let sent = 0;
  let failed = 0;

  for (const record of batch) {
    if (await sendCampaignEmail(input, record)) sent += 1;
    else failed += 1;
  }

  const nextOffset = offset + BATCH < audience.length ? offset + BATCH : null;

  // The paper trail, once the last batch is out.
  if (nextOffset === null) {
    await notifyCampaignSent(input, offset + sent, failed).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    mode,
    sent,
    failed,
    total: audience.length,
    nextOffset,
  });
}

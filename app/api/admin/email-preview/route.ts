import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import {
  renderAmbassadorApplicantEmail,
  renderAmbassadorTeamEmail,
  renderGuestEmail,
  renderPartnerInquirerEmail,
  renderPartnerTeamEmail,
  renderTalentApplicantEmail,
  renderTalentTeamEmail,
  renderTeamEmail,
} from "@/lib/email";
import { listPublicEvents } from "@/lib/store";
import type { SubmissionRecord } from "@/lib/types";

/**
 * GET /api/admin/email-preview?type=<template>[&format=text]
 *
 * Renders each email with sample data so you can see exactly what goes out
 * before switching SES on. Nothing is sent.
 */
export const PREVIEW_TYPES = [
  { value: "guest", label: "RSVP, to the guest" },
  { value: "team", label: "RSVP, to the team" },
  { value: "ambassador-applicant", label: "Ambassador, to the applicant" },
  { value: "ambassador-team", label: "Ambassador, to the team" },
  { value: "talent-applicant", label: "Talent, to the applicant" },
  { value: "talent-team", label: "Talent, to the team" },
  { value: "partner-inquirer", label: "Partner, to the sender" },
  { value: "partner-team", label: "Partner, to the team" },
] as const;

const RSVP_SAMPLE: SubmissionRecord = {
  pk: "rsvp#preview@example.com",
  type: "rsvp",
  email: "preview@example.com",
  name: "Alex Moreno",
  phone: "(480) 555-0142",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const AMBASSADOR_SAMPLE: SubmissionRecord = {
  pk: "ambassador#preview",
  type: "ambassador",
  email: "preview@example.com",
  name: "Alex Moreno",
  phone: "(480) 555-0142",
  social: "@alexmoreno",
  community: "Hospitality",
  message:
    "I've bartended in Old Town for four years and usually roll with a group of ten to fifteen from the industry. I'm also close with a few of the run-club and pilates crowds who are always looking for daytime plans.",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const TALENT_SAMPLE: SubmissionRecord = {
  pk: "talent#preview",
  type: "talent",
  email: "preview@example.com",
  name: "Alex Moreno",
  phone: "(480) 555-0142",
  role: "DJ",
  social: "soundcloud.com/alexmoreno, @alexmoreno",
  message:
    "I've been playing house around Phoenix for six years, mostly opening and sunset slots, which is the part I actually like. Happy to send a recent mix.",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const PARTNER_SAMPLE: SubmissionRecord = {
  pk: "partner#preview",
  type: "partner",
  email: "preview@example.com",
  name: "Alex Moreno",
  company: "Ridgeline Hospitality",
  phone: "(480) 555-0142",
  inquiryType: "Venue",
  message:
    "We run a pool deck in Old Town that sits empty most Saturdays through the summer. Capacity is about three hundred. Worth a conversation about hosting a date or two.",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "guest";
  const asText = url.searchParams.get("format") === "text";

  const events = await listPublicEvents();
  const featured = events.find((event) => event.featured) ?? events[0] ?? null;

  // A lookup rather than a ternary chain: this list grows every time a form is
  // added, and the chain was already six deep and silently fell through to the
  // guest email for any unknown type.
  const renderers: Record<string, () => { html: string; text: string }> = {
    guest: () => renderGuestEmail(RSVP_SAMPLE, featured),
    team: () => renderTeamEmail(RSVP_SAMPLE, 128),
    "ambassador-applicant": () => renderAmbassadorApplicantEmail(AMBASSADOR_SAMPLE),
    "ambassador-team": () => renderAmbassadorTeamEmail(AMBASSADOR_SAMPLE, 34),
    "talent-applicant": () => renderTalentApplicantEmail(TALENT_SAMPLE),
    "talent-team": () => renderTalentTeamEmail(TALENT_SAMPLE, 61),
    "partner-inquirer": () => renderPartnerInquirerEmail(PARTNER_SAMPLE),
    "partner-team": () => renderPartnerTeamEmail(PARTNER_SAMPLE, 12),
  };

  const render = renderers[type];
  if (!render) {
    return NextResponse.json(
      {
        ok: false,
        message: `Unknown preview type "${type}".`,
        available: PREVIEW_TYPES.map((option) => option.value),
      },
      { status: 400 },
    );
  }

  const message = render();

  return new NextResponse(asText ? message.text : message.html, {
    headers: {
      "Content-Type": asText
        ? "text/plain; charset=utf-8"
        : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

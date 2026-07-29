import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contact } from "../content/site.ts";
import {
  renderAmbassadorApplicantEmail,
  renderGuestEmail,
  renderPartnerInquirerEmail,
  renderPartnerTeamEmail,
  renderTalentApplicantEmail,
  renderTeamEmail,
} from "./email.ts";
import type { SubmissionRecord } from "./types.ts";

/**
 * These templates were the largest untested surface in the codebase, and the
 * one where a mistake is a legal problem rather than a rendering problem. The
 * assertions below are the properties that must hold on every message that
 * reaches a member of the public, not a snapshot of the wording.
 */

const base: Omit<SubmissionRecord, "type" | "pk"> = {
  email: "person@example.com",
  name: "Alex Moreno",
  phone: "(480) 555-0142",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const rsvp: SubmissionRecord = { ...base, pk: "rsvp#x", type: "rsvp" };
const ambassador: SubmissionRecord = {
  ...base,
  pk: "ambassador#x",
  type: "ambassador",
  community: "Hospitality",
  message: "I bartend in Old Town.",
};
const talent: SubmissionRecord = {
  ...base,
  pk: "talent#x",
  type: "talent",
  role: "DJ",
  message: "Six years playing house.",
};
const partner: SubmissionRecord = {
  ...base,
  pk: "partner#x",
  type: "partner",
  company: "Ridgeline Hospitality",
  inquiryType: "Venue",
  message: "We run a pool deck in Old Town.",
};

/** Every message that goes to a member of the public. */
const PUBLIC_FACING = [
  ["RSVP guest", () => renderGuestEmail(rsvp, null)],
  ["ambassador applicant", () => renderAmbassadorApplicantEmail(ambassador)],
  ["talent applicant", () => renderTalentApplicantEmail(talent)],
  ["partner inquirer", () => renderPartnerInquirerEmail(partner)],
] as const;

describe("public-facing email compliance", () => {
  for (const [label, render] of PUBLIC_FACING) {
    test(`${label}: carries the physical postal address`, () => {
      const { html, text } = render();
      // US commercial email rules require a real postal address in the message.
      const address = contact.postalAddress as string;
      assert.ok(address, "no postal address configured");
      // The HTML escapes nothing in this string, but compare loosely anyway.
      assert.ok(
        html.includes(address),
        `${label} HTML is missing the postal address`,
      );
      assert.ok(
        text.includes(address),
        `${label} plain text is missing the postal address`,
      );
    });

    test(`${label}: carries a working unsubscribe link`, () => {
      const { html, text, listUnsubscribe } = render() as {
        html: string;
        text: string;
        listUnsubscribe?: string;
      };
      assert.match(html, /\/unsubscribe\?token=/, `${label} HTML`);
      assert.match(text, /\/unsubscribe\?token=/, `${label} text`);
      // RFC 8058: the header is what makes Gmail and Outlook show their own
      // one-click button, which is what actually gets used.
      assert.ok(listUnsubscribe, `${label} has no List-Unsubscribe header`);
      assert.match(
        listUnsubscribe as string,
        /^<https?:\/\/.*\/unsubscribe\?token=.+>$/,
      );
    });

    test(`${label}: has both an HTML and a plain-text part`, () => {
      const { html, text } = render();
      assert.ok(html.trim().length > 0);
      assert.ok(text.trim().length > 0);
      // A text part that is just stripped HTML is worse than none.
      assert.ok(!text.includes("<td"), `${label} text part contains markup`);
      assert.ok(!text.includes("style="), `${label} text part contains markup`);
    });
  }
});

describe("internal notifications", () => {
  // These go to the team, so they must NOT carry an unsubscribe link: a staff
  // member clicking it would remove the applicant from the list.
  const INTERNAL = [
    ["RSVP team", () => renderTeamEmail(rsvp, 12)],
    ["partner team", () => renderPartnerTeamEmail(partner, 12)],
  ] as const;

  for (const [label, render] of INTERNAL) {
    test(`${label}: no unsubscribe link`, () => {
      const message = render() as { html: string; listUnsubscribe?: string };
      assert.equal(
        message.listUnsubscribe,
        undefined,
        `${label} should not set List-Unsubscribe`,
      );
      assert.ok(!message.html.includes("/unsubscribe?token="), `${label} HTML`);
    });
  }
});

describe("escaping", () => {
  test("a name containing markup cannot break out into the email body", () => {
    const hostile: SubmissionRecord = {
      ...partner,
      name: "<script>alert(1)</script>",
      company: 'Ridgeline" onmouseover="evil()',
    };
    const { html } = renderPartnerTeamEmail(hostile, 1);
    assert.ok(!html.includes("<script>"), "raw script tag survived");
    assert.ok(html.includes("&lt;script&gt;"), "script tag was not escaped");
    assert.ok(
      !html.includes('onmouseover="evil()"'),
      "attribute injection survived",
    );
  });

  test("a message body with markup is escaped too", () => {
    const hostile: SubmissionRecord = {
      ...partner,
      message: "<img src=x onerror=alert(1)>",
    };
    const { html } = renderPartnerTeamEmail(hostile, 1);
    assert.ok(!html.includes("<img src=x"), "raw img tag survived");
    assert.ok(html.includes("&lt;img"), "img tag was not escaped");
  });
});

describe("partner templates specifically", () => {
  // Added after an audit found partner inquiries notified nobody at all.
  test("the team notification names the company and the type", () => {
    const { subject, html } = renderPartnerTeamEmail(partner, 7);
    assert.match(subject, /Venue/);
    assert.match(subject, /Ridgeline Hospitality/);
    assert.ok(html.includes("Ridgeline Hospitality"));
    assert.ok(html.includes("We run a pool deck in Old Town."));
  });

  test("the acknowledgement does not leak internal links", () => {
    const { html } = renderPartnerInquirerEmail(partner);
    assert.ok(!html.includes("/admin"), "acknowledgement links into the dashboard");
  });

  test("missing optional fields degrade to a readable label", () => {
    const sparse: SubmissionRecord = {
      pk: "partner#y",
      type: "partner",
      email: "sparse@example.com",
      name: "",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    const { html, subject } = renderPartnerTeamEmail(sparse, 1);
    assert.ok(html.includes("Not given"));
    // The subject falls back through company, name, then email.
    assert.match(subject, /sparse@example\.com/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { contact, notifications } from "../content/site.ts";
import {
  renderAmbassadorApplicantEmail,
  renderGuestEmail,
  renderPartnerInquirerEmail,
  renderPartnerTeamEmail,
  renderTalentApplicantEmail,
  renderTeamEmail,
  mayEmail,
  mayAcknowledge,
  emailStatus,
  renderCampaignEmail,
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
      const { html, text } = render();
      assert.match(html, /\/unsubscribe\?token=/, `${label} HTML`);
      assert.match(text, /\/unsubscribe\?token=/, `${label} text`);
    });

    test(`${label}: does not claim to be bulk mail`, () => {
      const { listUnsubscribe } = render() as { listUnsubscribe?: string };
      /**
       * These four are acknowledgements, not campaigns: each answers a form
       * somebody just submitted. RFC 8058's List-Unsubscribe with One-Click is
       * the machine-readable marker for bulk mail, and Gmail files mail
       * carrying it under Promotions, where a confirmation goes unread.
       *
       * The footer link above still opts people out, so nothing is lost by
       * leaving the header off. A real campaign send must set it: Google
       * requires one-click unsubscribe above 5,000 messages a day to Gmail.
       */
      assert.equal(
        listUnsubscribe,
        undefined,
        `${label} sets List-Unsubscribe, which marks it as bulk`,
      );
    });

    test(`${label}: says the address is not monitored, and where to write`, () => {
      /**
       * Replies to these go to a no-reply address, so the message has to name
       * one a person reads. A reply that vanishes silently is worse than not
       * offering the address at all.
       */
      const { html, text } = render();
      const human = contact.email as string;
      assert.ok(human, "no contact address configured");
      for (const [part, body] of [
        ["HTML", html],
        ["text", text],
      ] as const) {
        assert.match(body, /not monitored/i, `${label} ${part}`);
        assert.ok(body.includes(human), `${label} ${part} omits ${human}`);
      }
    });

    test(`${label}: is laid out as a receipt, not a newsletter`, () => {
      /**
       * Gmail classifies on structure as much as on wording, and the designed
       * template (dark banner, accent stripe, rounded card on a tinted
       * background) is the shape of a mailshot. An acknowledgement wearing it
       * gets filed under Promotions, where a confirmation goes unread.
       *
       * These markers are the chrome that distinguishes the two layouts. The
       * designed shell stays for genuine campaign sends.
       */
      const { html } = render();
      for (const [marker, what] of [
        ["border-radius:20px", "the rounded card"],
        ["padding:26px 32px", "the branded banner"],
        // 0.2em is the banner wordmark and the eyebrow. The detail rows use
        // 0.14em, and uppercase labels on a Date/Location table are ordinary
        // receipt styling rather than chrome.
        ["letter-spacing:0.2em", "the eyebrow or banner wordmark"],
      ] as const) {
        assert.ok(
          !html.includes(marker),
          `${label} still carries ${what}`,
        );
      }
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

describe("per-event email customisation", () => {
  const baseEvent = {
    id: "sun-club",
    name: "Sun Club",
    tagline: "",
    summary: "",
    heroBody: "",
    status: "",
    date: "Saturday, May 16",
    location: "Old Town Scottsdale",
    tags: [],
    genres: [],
    tone: "dusk" as const,
    featured: true,
    published: true,
    rsvpEnabled: true,
    order: 0,
    shotNote: "",
    image: null,
    imageAlt: "",
    ctaLabel: "",
    ctaAction: "rsvp" as const,
    emailSubject: null,
    emailHeading: null,
    emailBody: null,
    createdAt: "",
    updatedAt: "",
  };

  test("falls back to the standard wording when nothing is customised", () => {
    const { subject, html } = renderGuestEmail(rsvp, baseEvent);
    assert.match(subject, /You're confirmed for Sun Club/);
    assert.match(html, /Thanks Alex, your spot on the Sun Club list is confirmed/);
  });

  test("uses the custom subject, opening line and body", () => {
    const { subject, html, text } = renderGuestEmail(rsvp, {
      ...baseEvent,
      emailSubject: "See you poolside",
      emailHeading: "You're in.",
      emailBody: "Doors at four.\n\nBring a towel.",
    });
    assert.equal(subject, "See you poolside");
    assert.match(html, /You're in\./);
    assert.match(html, /Doors at four\./);
    assert.match(html, /Bring a towel\./);
    // The plain-text part must carry the same wording, or text-only clients see
    // different copy and filters treat the mismatch as a signal.
    assert.match(text, /You're in\./);
    assert.match(text, /Doors at four\./);
  });

  test("substitutes {name} and {event}", () => {
    const { subject, html } = renderGuestEmail(rsvp, {
      ...baseEvent,
      emailSubject: "{name}, you're on the {event} list",
      emailHeading: "Hi {name}, welcome to {event}.",
    });
    assert.equal(subject, "Alex, you're on the Sun Club list");
    assert.match(html, /Hi Alex, welcome to Sun Club\./);
  });

  test("blank custom fields are treated as unset, not as empty copy", () => {
    const { subject, html } = renderGuestEmail(rsvp, {
      ...baseEvent,
      emailSubject: "   ",
      emailHeading: "",
      emailBody: "\n  \n",
    });
    assert.match(subject, /You're confirmed for Sun Club/);
    assert.match(html, /Thanks Alex/);
  });

  test("custom copy is escaped, so it cannot break the layout or inject markup", () => {
    const { html } = renderGuestEmail(rsvp, {
      ...baseEvent,
      emailHeading: "<script>alert(1)</script>",
      emailBody: "</td></table><img src=x onerror=alert(1)>",
    });
    assert.ok(!html.includes("<script>"), "raw script survived");
    assert.ok(!html.includes("<img src=x"), "raw img survived");
    assert.match(html, /&lt;script&gt;/);
  });

  test("blank lines become separate paragraphs", () => {
    const { html } = renderGuestEmail(rsvp, {
      ...baseEvent,
      emailBody: "First para.\n\nSecond para.\n\nThird para.",
    });
    const count = (html.match(/First para\.|Second para\.|Third para\./g) ?? [])
      .length;
    assert.equal(count, 3);
    assert.ok(!html.includes("First para.\n\nSecond"), "not left as one blob");
  });
});

describe("mayEmail suppression", () => {
  test("allows a normal subscriber", () => {
    assert.equal(mayEmail({ ...rsvp, status: "subscribed" }), true);
    assert.equal(mayEmail(rsvp), true, "no status set means allowed");
  });

  test("blocks unsubscribed and bounced", () => {
    // These were labels only until this existed: marking somebody unsubscribed
    // in the dashboard did not stop a single message reaching them.
    assert.equal(mayEmail({ ...rsvp, status: "unsubscribed" }), false);
    assert.equal(mayEmail({ ...rsvp, status: "bounced" }), false);
  });

  test("does not block review statuses, which are about our workflow", () => {
    for (const status of ["new", "reviewing", "contacted", "accepted"] as const) {
      assert.equal(mayEmail({ ...rsvp, status }), true, `blocked "${status}"`);
    }
  });
});

describe("the sender has a name", () => {
  /**
   * The regression this pins.
   *
   * SES_FROM_ADDRESS is a bare mailbox, and a bare address leaves the client to
   * invent a sender name. Gmail uses the local part, so every message arrived
   * in the list attributed to "hello" rather than to the company.
   */
  const withEnv = (vars: Record<string, string>, run: () => void) => {
    const saved = { ...process.env };
    Object.assign(process.env, vars);
    try {
      run();
    } finally {
      process.env = saved;
    }
  };

  test("a bare address gains the company name", () => {
    withEnv(
      { SES_FROM_ADDRESS: "hello@1127.events", APP_SECRET: "x".repeat(40) },
      () => {
        assert.match(emailStatus().detail, /1127 Events <hello@1127\.events>/);
      },
    );
  });

  test("an address that already has a display name is left alone", () => {
    withEnv(
      {
        SES_FROM_ADDRESS: "Sun Club <hi@1127.events>",
        APP_SECRET: "x".repeat(40),
      },
      () => {
        const { detail } = emailStatus();
        assert.match(detail, /Sun Club <hi@1127\.events>/);
        assert.ok(
          !detail.includes("1127 Events <Sun Club"),
          "double-wrapped the display name",
        );
      },
    );
  });
});

describe("the music line follows the event", () => {
  /**
   * The regression this pins.
   *
   * This row was hardcoded to "House", so somebody signing up for a bass or
   * techno night was told the wrong thing in the one email they actually read.
   */
  const withGenres = (genres: string[]) =>
    renderGuestEmail(rsvp, {
      id: "x",
      name: "X",
      tagline: "",
      summary: "",
      heroBody: "",
      status: "",
      date: "",
      location: "",
      tags: [],
      genres,
      tone: "dusk" as const,
      featured: true,
      published: true,
      rsvpEnabled: true,
      order: 0,
      shotNote: "",
      image: null,
      imageAlt: "",
      ctaLabel: "",
      ctaAction: "rsvp" as const,
      emailSubject: null,
      emailHeading: null,
      emailBody: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

  test("names the event's own genres", () => {
    const { text } = withGenres(["Bass", "Dubstep"]);
    assert.match(text, /Music: Bass, Dubstep/);
    assert.ok(!text.includes("Music: House"), "still claiming House");
  });

  test("degrades honestly when no genre is set", () => {
    assert.match(withGenres([]).text, /Music: Announcing soon/);
  });
});

describe("every form alerts somebody", () => {
  /**
   * The gap this closes.
   *
   * notifications.partner was an empty list while the other three went to the
   * team. Nothing errored and nothing logged: a venue enquiry simply arrived,
   * was stored correctly, and nobody was told. Partner enquiries are the
   * highest-value thing the site collects, so silence there is the most
   * expensive kind.
   */
  test("no form type is configured to notify nobody", () => {
    for (const [type, list] of Object.entries(notifications)) {
      assert.ok(
        list.length > 0,
        `${type} submissions notify nobody, so they arrive silently`,
      );
    }
  });
});

const baseEventForHints = {
  id: "x",
  name: "X",
  tagline: "",
  summary: "",
  heroBody: "",
  status: "",
  date: "",
  location: "",
  tags: [],
  genres: [],
  tone: "dusk" as const,
  featured: true,
  published: true,
  rsvpEnabled: true,
  order: 0,
  shotNote: "",
  image: null,
  imageAlt: "",
  ctaLabel: "",
  ctaAction: "rsvp" as const,
  emailSubject: null,
  emailHeading: null,
  emailBody: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("the dashboard hints match the real defaults", () => {
  /**
   * These strings live in the event form as placeholders and "Default: ..."
   * hints, and they had gone stale: the form still promised "You're on the Sun
   * Club list" long after the subject became "You're confirmed for <event>",
   * and named Sun Club specifically on a site with several events.
   *
   * Nothing breaks when they drift, which is why they drifted. An admin simply
   * gets told the wrong thing about what leaving a box empty will do.
   */
  const form = readFileSync("components/admin/EventForm.tsx", "utf8");

  test("the subject hint matches what renderGuestEmail actually sends", () => {
    const { subject } = renderGuestEmail(rsvp, {
      ...baseEventForHints,
      name: "Ibiza Nights",
    });
    assert.equal(subject, "You're confirmed for Ibiza Nights");
    assert.ok(
      form.includes("You're confirmed for {event}"),
      "the form advertises a different default subject",
    );
  });

  test("no dashboard hint names one event as though it were the only one", () => {
    assert.ok(
      !form.includes("Sun Club list"),
      "a hint still names Sun Club as the default",
    );
  });
});

describe("an opt-out stops marketing, not receipts", () => {
  /**
   * The gap this closes.
   *
   * Somebody who had unsubscribed and then RSVPed to a different night got
   * nothing at all: the form reported success, no email arrived, and from their
   * side the RSVP had silently failed. Leaving an event mailing list is not a
   * request to stop being told that a form went through.
   *
   * They stay off the list either way. Only the receipt changes.
   */
  const gone: SubmissionRecord = {
    ...rsvp,
    status: "unsubscribed",
    marketingOptIn: false,
    unsubscribedAt: "2026-07-01T00:00:00.000Z",
    unsubscribedSource: "self",
  };
  const dead: SubmissionRecord = { ...rsvp, status: "bounced" };

  test("an unsubscribed address still gets its confirmation", () => {
    assert.equal(mayEmail(gone), false, "still not marketable");
    assert.equal(mayAcknowledge(gone), true, "but a receipt is fine");
  });

  test("a dead address gets nothing", () => {
    // Not a preference. There is nobody at the other end.
    assert.equal(mayAcknowledge(dead), false);
  });

  test("their confirmation does not promise emails they will not get", () => {
    const { text } = renderGuestEmail(gone, null);
    assert.ok(
      !text.includes("We'll email you as soon as the next date is set"),
      "promises mail to somebody who opted out",
    );
    assert.match(text, /only message you'll get/);
  });

  test("a subscriber's confirmation still says what happens next", () => {
    const { text } = renderGuestEmail(
      { ...rsvp, status: "subscribed", marketingOptIn: true },
      null,
    );
    assert.match(text, /We'll email you as soon as the next date is set/);
  });
});

describe("campaign email", () => {
  const input = {
    subject: "The next date is live",
    heading: "See you at the pool.",
    body: "Hey {name},\n\nDoors at two. Bring people.",
  };
  const recipient: SubmissionRecord = {
    ...rsvp,
    email: "guest@example.com",
    name: "Alex Moreno",
  };

  /**
   * Campaigns are the one genuinely bulk thing this app sends, so the rules are
   * the acknowledgements' rules inverted. An acknowledgement hiding the bulk
   * marker is honest; a campaign hiding it is how a domain gets burned.
   */
  test("carries the bulk-mail headers the acknowledgements must not", () => {
    const message = renderCampaignEmail(input, recipient);
    assert.match(
      message.listUnsubscribe ?? "",
      /^<https?:\/\/.*\/unsubscribe\?token=.+>$/,
      "a campaign without List-Unsubscribe burns the domain",
    );
  });

  test("carries the postal address and a working unsubscribe link", () => {
    const { html, text } = renderCampaignEmail(input, recipient);
    const address = contact.postalAddress as string;
    for (const part of [html, text]) {
      assert.ok(part.includes(address), "postal address missing");
      assert.match(part, /\/unsubscribe\?token=/);
    }
  });

  test("the unsubscribe token is the recipient's, not anybody else's", () => {
    const a = renderCampaignEmail(input, recipient);
    const b = renderCampaignEmail(input, { ...recipient, email: "other@example.com" });
    const token = (m: { html: string }) =>
      m.html.match(/token=([^"&]+)/)?.[1];
    assert.notEqual(token(a), token(b), "two people got the same opt-out link");
  });

  test("fills {name} with the first name", () => {
    const { html, text, subject } = renderCampaignEmail(
      { ...input, subject: "For {name}" },
      recipient,
    );
    assert.match(text, /Hey Alex,/);
    assert.match(html, /Hey Alex,/);
    assert.equal(subject, "For Alex");
  });

  test("a recipient with no name gets 'there', not a blank", () => {
    const { text } = renderCampaignEmail(input, { ...recipient, name: "" });
    assert.match(text, /Hey there,/);
  });

  test("body content is escaped, so a crafted name cannot inject markup", () => {
    const { html } = renderCampaignEmail(input, {
      ...recipient,
      name: "<script>alert(1)</script>",
    });
    assert.ok(!html.includes("<script>alert(1)"), "raw script tag survived");
  });

  test("blank heading falls back to the subject", () => {
    const { html } = renderCampaignEmail({ ...input, heading: "" }, recipient);
    assert.ok(html.includes("The next date is live"));
  });
});

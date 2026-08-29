import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { brand, contact, notifications } from "../content/site.ts";
import { isMailable, isSuppressed } from "./audience.ts";
import { hasRealSecret, unsubscribeToken } from "./tokens.ts";
import type { EventRecord, SubmissionRecord } from "./types.ts";

/**
 * Transactional email via Amazon SES.
 *
 * Two messages go out when someone RSVPs for the first time:
 *   1. a confirmation to the guest, with a working unsubscribe link
 *   2. a heads-up to the 1127 team
 *
 * Both are best-effort. `notifyRsvp` never throws and never blocks the API
 * response, a failed send must not lose the signup, which is already safely
 * written to DynamoDB by the time this runs.
 */

const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

/**
 * The From header, with a display name.
 *
 * SES_FROM_ADDRESS is a bare mailbox, and a bare address leaves the client to
 * invent a sender name. Gmail uses the local part, so every message showed up
 * in the list as "hello". The address is unchanged; it just arrives attributed
 * to the company. An env value that already carries its own display name is
 * left alone.
 */
const FROM = () => {
  const raw = process.env.SES_FROM_ADDRESS?.trim();
  if (!raw) return undefined;
  return raw.includes("<") ? raw : `${brand.name} <${raw}>`;
};

const REPLY_TO = () => process.env.SES_REPLY_TO?.trim();

/**
 * Where replies to an acknowledgement go.
 *
 * Nothing can stop somebody hitting reply, so the question is only where it
 * lands. These messages are automated and answer a form; a reply to one is
 * almost always meant for a person, and pointing it at the sending mailbox
 * buries it among confirmations nobody reads. It goes to a no-reply address
 * instead, and the footer tells people where to write for a human.
 *
 * Defaults to no-reply@ on the sending domain, overridable when that mailbox
 * should be something else.
 */
const NO_REPLY = () => {
  const explicit = process.env.SES_NO_REPLY_ADDRESS?.trim();
  if (explicit) return explicit;
  const domain = (process.env.SES_FROM_ADDRESS ?? "").split("@")[1]?.trim();
  return domain ? `no-reply@${domain}` : undefined;
};
const CONFIG_SET = () => process.env.SES_CONFIGURATION_SET?.trim();

/**
 * Internal recipients for a form. The environment variable wins when set, so
 * staging can point at a test inbox; otherwise the defaults in
 * content/site.ts apply.
 */
function recipients(kind: "rsvp" | "ambassador" | "partner" | "talent"): string[] {
  const override = {
    rsvp: process.env.RSVP_NOTIFY_ADDRESS,
    ambassador: process.env.AMBASSADOR_NOTIFY_ADDRESS,
    partner: process.env.PARTNER_NOTIFY_ADDRESS,
    talent: process.env.TALENT_NOTIFY_ADDRESS,
  }[kind];

  const list =
    override !== undefined ? override.split(",") : [...notifications[kind]];

  return list.map((address) => address.trim()).filter(Boolean);
}

/**
 * One-click unsubscribe link, signed so it cannot be forged into a request to
 * remove somebody else. Every email that reaches a member of the public needs
 * one, so it is a function rather than something each template rebuilds.
 */
function unsubscribeUrl(email: string): string {
  return `${siteUrl()}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email))}`;
}

/**
 * The physical address shown in every email footer. Commercial email rules
 * require one, so when it is missing the footer says so rather than quietly
 * omitting it and looking compliant.
 */
function postalLine(): string {
  return (
    contact.postalAddress ??
    `1127 Events, ${brand.region} (postal address not yet configured)`
  );
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? brand.domain).replace(/\/+$/, "");
}

export type EmailStatus = {
  /** Guest confirmations are being sent. */
  guest: boolean;
  /** Internal notifications are being sent. */
  team: boolean;
  /** Human-readable reason when something is off. */
  detail: string;
};

export function emailStatus(): EmailStatus {
  const from = FROM();
  const inboxes = [
    ...recipients("rsvp"),
    ...recipients("ambassador"),
    ...recipients("partner"),
    ...recipients("talent"),
  ];

  if (!from) {
    return {
      guest: false,
      team: false,
      detail:
        "SES_FROM_ADDRESS is not set, so no email is sent. Submissions are still recorded.",
    };
  }

  // An unsubscribe link signed with the shared development key would be
  // forgeable, so guest mail waits for a real secret.
  if (!hasRealSecret()) {
    return {
      guest: false,
      team: inboxes.length > 0,
      detail:
        "APP_SECRET is missing or too short, so confirmations to guests and applicants are paused (their unsubscribe links would be forgeable). Set a random 32+ character value. Internal notifications still send.",
    };
  }

  const team = inboxes.length > 0;
  return {
    guest: true,
    team,
    detail: team
      ? `Sending from ${from}. Internal alerts go to ${[...new Set(inboxes)].join(", ")}.`
      : `Sending from ${from}. No internal alert recipients are configured.`,
  };
}

let ses: SESv2Client | null = null;
function client(): SESv2Client {
  if (!ses) ses = new SESv2Client({ region: region() });
  return ses;
}

/**
 * Exported narrowly for the campaign test-send, which must reach the admin's
 * own inbox even when that address is unsubscribed (isMailable would block it).
 * Everything else goes through the typed notify functions above it.
 */
export async function sendDirect(input: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  return send(input);
}

async function send(input: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  listUnsubscribe?: string;
}): Promise<void> {
  const from = FROM();
  if (!from) return;

  const headers: SendEmailCommandInput = {
    FromEmailAddress: from,
    Destination: { ToAddresses: input.to },
    ReplyToAddresses: input.replyTo
      ? [input.replyTo]
      : REPLY_TO()
        ? [REPLY_TO() as string]
        : undefined,
    ConfigurationSetName: CONFIG_SET(),
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: input.html, Charset: "UTF-8" },
          Text: { Data: input.text, Charset: "UTF-8" },
        },
        // Set this on campaign sends only.
        //
        // List-Unsubscribe with One-Click is the machine-readable "this is bulk
        // mail" marker, and Gmail files mail carrying it under Promotions. The
        // four acknowledgements this app sends are not bulk: each one answers a
        // form somebody just submitted, and a confirmation nobody sees is a
        // confirmation that failed. They carry a plain unsubscribe link in the
        // footer instead, which opts people out just as well without asserting
        // to the receiving server that this was a mailshot.
        //
        // Google requires one-click unsubscribe above 5,000 messages a day to
        // Gmail. A real campaign send must set this.
        Headers: input.listUnsubscribe
          ? [
              { Name: "List-Unsubscribe", Value: input.listUnsubscribe },
              {
                Name: "List-Unsubscribe-Post",
                Value: "List-Unsubscribe=One-Click",
              },
            ]
          : undefined,
      },
    },
  };

  await client().send(new SendEmailCommand(headers));
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

const BONE = "#f7f2e9";
const INK = "#191713";
const MUTED = "#6b6355";
const SUN = "#e0a63c";
const DEEP = "#07142f";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turns admin-written plain text into escaped paragraphs.
 *
 * Blank lines separate paragraphs, which is how people naturally write in a
 * textarea. Everything is escaped: this copy comes from a form field and ends up
 * in a message sent from our own domain, so it is never trusted as markup.
 */
function paragraphs(text: string, colour: string): string {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 26px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${colour};">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n    ");
}

function factRows(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(25,23,19,0.10);font:500 11px/1.3 Helvetica,Arial,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(25,23,19,0.10);font:400 15px/1.4 Helvetica,Arial,sans-serif;color:${INK};text-align:right;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
}

/**
 * Table-based, inline-styled layout with a plain-text alternative, the
 * lowest-common-denominator that renders correctly in Outlook and Gmail alike.
 * No webfonts: Georgia stands in for the display face.
 */
/**
 * Sent from an address nobody reads, with the address that somebody does.
 *
 * Saying so is the point. A reply that vanishes silently is worse than no
 * reply address at all, so the message that takes no replies has to name the
 * one that does.
 */
export function noReplyText(): string {
  const human = contact.email;
  return human
    ? `This message is automated and this address is not monitored. Write to ${human} if you need us.`
    : "This message is automated and this address is not monitored.";
}

function noReplyNote(): string {
  return `<p style="margin:0 0 8px;">${escapeHtml(noReplyText())}</p>`;
}

/**
 * The layout for an acknowledgement.
 *
 * Branded, but not a mailshot. The first version of this stripped every colour
 * out to escape Promotions, which worked and looked like a bank statement. The
 * heavy signals were never the palette: they were List-Unsubscribe, a
 * pill-shaped call-to-action pointing at the marketing site, and a subject
 * about joining a list. Those stay gone.
 *
 * What comes back is the wordmark on the brand colour and the accent rule under
 * it, on a plain background with no rounded card and no tinted page. It reads as
 * 1127 at a glance and still reads as a receipt.
 *
 * Placement is per-recipient and adaptive, so this is a judgement rather than a
 * guarantee. If confirmations start landing in Promotions again, the header
 * block here is the first thing to try removing.
 */
function receiptShell(options: {
  preheader: string;
  heading: string;
  body: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BONE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BONE};padding:24px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr>
        <td style="background:${DEEP};padding:18px 22px;border-radius:10px 10px 0 0;">
          <img src="${siteUrl()}/api/brand-logo?v=1" width="25" height="28" alt="1127 Events" style="display:block;height:28px;width:auto;border:0;" />
        </td>
      </tr>
      <tr>
        <td style="height:3px;background:${SUN};"></td>
      </tr>
      <tr>
        <td style="height:20px;"></td>
      </tr>
      <tr>
        <td style="padding:0 0 4px;">
          <h1 style="margin:0 0 16px;font:600 20px/1.3 Georgia,'Times New Roman',serif;color:${INK};">${escapeHtml(options.heading)}</h1>
          ${options.body}
        </td>
      </tr>
      <tr>
        <td style="padding:24px 0 0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
          ${noReplyNote()}${options.footer}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function shell(options: {
  preheader: string;
  heading: string;
  eyebrow: string;
  body: string;
  footer: string;
  /** Adds the line telling people this address is not read. */
  noReply?: boolean;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BONE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BONE};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f2;border:1px solid rgba(25,23,19,0.10);border-radius:20px;overflow:hidden;">
      <tr>
        <td style="background:${DEEP};padding:26px 32px;">
          <img src="${siteUrl()}/api/brand-logo?v=1" width="28" height="32" alt="1127 Events" style="display:block;height:32px;width:auto;border:0;" />
        </td>
      </tr>
      <tr>
        <td style="height:4px;background:${SUN};"></td>
      </tr>
      <tr>
        <td style="padding:36px 32px 32px;">
          <p style="margin:0 0 14px;font:500 11px/1.3 Helvetica,Arial,sans-serif;letter-spacing:0.2em;text-transform:uppercase;color:${MUTED};">${escapeHtml(options.eyebrow)}</p>
          <h1 style="margin:0 0 18px;font:600 30px/1.15 Georgia,'Times New Roman',serif;color:${INK};">${escapeHtml(options.heading)}</h1>
          ${options.body}
        </td>
      </tr>
      <tr>
        <td style="padding:22px 32px 30px;border-top:1px solid rgba(25,23,19,0.10);font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
          ${options.noReply ? noReplyNote() : ""}${options.footer}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function renderGuestEmail(
  record: SubmissionRecord,
  event: EventRecord | null,
) {
  const unsubUrl = unsubscribeUrl(record.email);

  // With no event attached there is no name to borrow, and borrowing the
  // series name went stale the moment the series was renamed. The no-event
  // wording talks about "the list" instead.
  const name = event?.name?.trim() || null;
  const firstName = record.name.trim().split(/\s+/)[0] || "there";

  const facts: Array<[string, string]> = [
    ["Date", event?.date ?? "Dates announcing soon"],
    ["Location", event?.location ?? brand.region],
    // Was hardcoded to "House", which told everyone signing up for a bass or
    // techno night the wrong thing. The event carries its genres; use them.
    ["Music", event?.genres?.length ? event.genres.join(", ") : "Announcing soon"],
  ];

  // Per-event wording when an admin has set it, the standard copy otherwise.
  // {name} is substituted so a custom line can still greet people by name
  // without the admin needing to know anything about templating.
  const fill = (value: string) =>
    value
      .replace(/\{name\}/g, firstName)
      .replace(/\{event\}/g, name ?? "the next event");

  const openingText = event?.emailHeading?.trim()
    ? fill(event.emailHeading.trim())
    : name
      ? `Thanks ${firstName}, your spot on the ${name} list is confirmed.`
      : `Thanks ${firstName}, you're on the list.`;

  const bodyText = event?.emailBody?.trim()
    ? fill(event.emailBody.trim())
    : mayEmail(record)
      ? "We'll email you as soon as the next date is set. Nothing else, and never more than we'd want to receive ourselves."
      : "You're off the email list, so this is the only message you'll get about it. Sign up again any time you want the next date.";

  const body = `
    <p style="margin:0 0 16px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(openingText)}</p>
    ${paragraphs(bodyText, MUTED)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows(facts)}
    </table>
    <!-- No call-to-action button here on purpose. A pill button pointing at the
         marketing site is the other half of what makes a confirmation read as an
         advert, both to the reader and to Gmail's classifier. This message has
         one job: confirm the signup. -->`;

  const footer = `
    <p style="margin:0 0 8px;">${escapeHtml(postalLine())}</p>
    <p style="margin:0;">You're getting this because you asked to hear about ${name ? escapeHtml(name) : "upcoming"} dates.
      <a href="${unsubUrl}" style="color:${MUTED};">Unsubscribe</a>.</p>`;

  // The plain-text part carries the same custom wording. Letting the two drift
  // means anyone reading in a text-only client gets different copy, and spam
  // filters treat a mismatched multipart message as a signal.
  const text = [
    openingText,
    "",
    bodyText,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    siteUrl(),
    "",
    noReplyText(),
    postalLine(),
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");

  return {
    subject: event?.emailSubject?.trim()
      ? fill(event.emailSubject.trim())
      : name
        ? `You're confirmed for ${name}`
        : "You're on the list",
    html: receiptShell({
      // This is the grey preview line next to the subject in an inbox list.
      // It should read as a receipt, because that is what this is.
      preheader: name
        ? `Your spot on the ${name} list is confirmed.`
        : "You're on the list.",
      heading: "You're confirmed.",
      body,
      footer,
    }),
    text,
  };
}

export function renderAmbassadorApplicantEmail(record: SubmissionRecord) {
  const unsubUrl = unsubscribeUrl(record.email);

  const firstName = record.name.trim().split(/\s+/)[0] || "there";

  const body = `
    <p style="margin:0 0 16px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${INK};">Thanks ${escapeHtml(firstName)}, your ambassador application is in.</p>
    <p style="margin:0 0 16px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${MUTED};">We review applications ahead of every date and reach out directly to the people we'd like to work with. We work with a small group each season, so it may be a little while before you hear from us.</p>
    <p style="margin:0 0 26px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${MUTED};">In the meantime you're on the list for date announcements.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows([
        ["Community", record.community || "Not given"],
        ["Social", record.social || "Not given"],
      ])}
    </table>
    <p style="margin:26px 0 0;">
      <a href="${siteUrl()}/#ambassadors" style="display:inline-block;background:${INK};color:${BONE};text-decoration:none;font:500 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:999px;">About the program</a>
    </p>`;

  const footer = `
    <p style="margin:0 0 8px;">${escapeHtml(postalLine())}</p>
    <p style="margin:0;">You're getting this because you applied to the 1127 Ambassador Program.
      <a href="${unsubUrl}" style="color:${MUTED};">Unsubscribe</a>.</p>`;

  const text = [
    `Thanks ${firstName}, your ambassador application is in.`,
    "",
    "We review applications ahead of every date and reach out directly to the people we'd like to work with.",
    "",
    `Community: ${record.community || "Not given"}`,
    `Social: ${record.social || "Not given"}`,
    "",
    `${siteUrl()}/#ambassadors`,
    "",
    noReplyText(),
    postalLine(),
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");

  return {
    subject: "Your 1127 ambassador application",
    html: receiptShell({
      preheader: "We have your ambassador application.",
      heading: "Application received.",
      body,
      footer,
    }),
    text,
  };
}

export function renderAmbassadorTeamEmail(record: SubmissionRecord, total: number) {
  const facts: Array<[string, string]> = [
    ["Name", record.name || "Not given"],
    ["Email", record.email],
    ["Phone", record.phone || "Not given"],
    ["Social", record.social || "Not given"],
    ["Community", record.community || "Not given"],
    ["Applications", String(total)],
  ];

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows(facts)}
    </table>
    ${
      record.message
        ? `<div style="margin:24px 0 0;padding:18px 20px;background:rgba(25,23,19,0.04);border-radius:14px;">
             <p style="margin:0 0 8px;font:500 11px/1.3 Helvetica,Arial,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">About them</p>
             <p style="margin:0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};white-space:pre-wrap;">${escapeHtml(record.message)}</p>
           </div>`
        : ""
    }
    <p style="margin:26px 0 0;">
      <a href="${siteUrl()}/admin/list" style="display:inline-block;background:${INK};color:${BONE};text-decoration:none;font:500 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:999px;">Open the applications</a>
    </p>`;

  const text = [
    "New ambassador application",
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    record.message ? `About them:\n${record.message}` : "",
    "",
    `${siteUrl()}/admin/list`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Ambassador application, ${record.name || record.email}`,
    html: shell({
      preheader: `${record.name || record.email} applied. ${total} total.`,
      eyebrow: "Internal notification",
      heading: "New ambassador application.",
      body,
      footer: `<p style="margin:0;">Sent to the 1127 team. Recipients are set in content/site.ts under <code>notifications.ambassador</code>.</p>`,
    }),
    text,
  };
}

export function renderTeamEmail(record: SubmissionRecord, total: number) {
  const facts: Array<[string, string]> = [
    ["Name", record.name || "Not given"],
    ["Email", record.email],
    ["Phone", record.phone || "Not given"],
    ["List total", String(total)],
  ];

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows(facts)}
    </table>
    <p style="margin:26px 0 0;">
      <a href="${siteUrl()}/admin/list" style="display:inline-block;background:${INK};color:${BONE};text-decoration:none;font:500 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:999px;">Open the list</a>
    </p>`;

  const text = [
    "New signup",
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    `${siteUrl()}/admin/list`,
  ].join("\n");

  return {
    subject: `New signup, ${record.name || record.email}`,
    html: shell({
      preheader: `${record.email} joined the list. ${total} total.`,
      eyebrow: "Internal notification",
      heading: "New signup.",
      body,
      footer: `<p style="margin:0;">Sent to the 1127 team because RSVP_NOTIFY_ADDRESS is configured.</p>`,
    }),
    text,
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Fire-and-forget. Callers should NOT await this in a way that can fail the
 * request, every path swallows its errors and logs them.
 */
type Rendered = {
  subject: string;
  html: string;
  text: string;
  listUnsubscribe?: string;
};

/** Each send is isolated: one failure never prevents the other. */
/**
 * Whether we are still allowed to email this person.
 *
 * Until this existed, the "Unsubscribed" and "Bounced" statuses in the
 * dashboard were labels and nothing more: setting one changed how a row was
 * filtered and did not stop a single message. Somebody marking a person
 * unsubscribed because they asked in person would reasonably assume it worked.
 *
 * Only applies to mail addressed to the member of the public. Internal team
 * notifications are not affected, because a bounced guest address is exactly
 * the sort of thing the team still needs to be told about.
 */
/**
 * May we send this person marketing?
 *
 * Delegates to the audience module rather than re-deriving it from status.
 * Suppression has more states than a status check sees (the timestamp pair on
 * application rows, resubscribes), and two definitions of "may we email them"
 * is how a screen and a send disagree.
 */
export function mayEmail(record: SubmissionRecord): boolean {
  return record.status !== "bounced" && !isSuppressed(record);
}

/**
 * May we send this person a receipt for something they just did?
 *
 * Yes, unless the address is dead. Unsubscribing from event announcements is
 * not a request to stop being told that a form went through, any more than
 * leaving a shop's newsletter cancels your order confirmations.
 *
 * This mattered: somebody who had unsubscribed and then RSVPed to a different
 * night got nothing at all. The form said it worked, no email arrived, and from
 * their side an RSVP had silently failed. They are still not on the mailing
 * list, and the confirmation drops the line promising future emails, because
 * for them it would not be true.
 */
export function mayAcknowledge(record: SubmissionRecord): boolean {
  return record.status !== "bounced";
}

async function trySend(
  label: string,
  to: string[],
  message: Rendered,
  replyTo?: string,
): Promise<void> {
  if (to.length === 0) return;
  try {
    await send({
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      listUnsubscribe: message.listUnsubscribe,
      replyTo,
    });
  } catch (error) {
    console.error(`[1127] ${label} email failed`, error);
  }
}

export async function notifyRsvp(
  record: SubmissionRecord,
  event: EventRecord | null,
  listTotal: number,
): Promise<void> {
  const status = emailStatus();

  if (status.guest && mayAcknowledge(record)) {
    await trySend(
      "signup confirmation",
      [record.email],
      renderGuestEmail(record, event),
      NO_REPLY(),
    );
  }

  await trySend(
    "signup team notification",
    recipients("rsvp"),
    renderTeamEmail(record, listTotal),
    record.email,
  );
}

/**
 * Ambassador applications notify the team addresses in
 * `notifications.ambassador` and send the applicant an acknowledgement.
 */
export async function notifyAmbassador(
  record: SubmissionRecord,
  total: number,
): Promise<void> {
  const status = emailStatus();

  if (status.guest && mayAcknowledge(record)) {
    await trySend(
      "Ambassador acknowledgement",
      [record.email],
      renderAmbassadorApplicantEmail(record),
      NO_REPLY(),
    );
  }

  await trySend(
    "Ambassador team notification",
    recipients("ambassador"),
    renderAmbassadorTeamEmail(record, total),
    record.email,
  );
}

/* -------------------------------------------------------------------------- */
/* Talent applications (/opportunities)                                        */
/* -------------------------------------------------------------------------- */

export function renderTalentApplicantEmail(record: SubmissionRecord) {
  const unsubUrl = unsubscribeUrl(record.email);
  const firstName = record.name.trim().split(/\s+/)[0] || "there";

  const body = `
    <p style="margin:0 0 16px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${INK};">Thanks ${escapeHtml(firstName)}, we've got your application to work with 1127.</p>
    <p style="margin:0 0 26px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${MUTED};">We read everything that comes in and reach out when there's a date that fits. Bookings are made per event, so it may be a little while before you hear from us.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows([["Applied for", record.role || "Not given"]])}
    </table>
    <p style="margin:26px 0 0;">
      <a href="${siteUrl()}/opportunities" style="display:inline-block;background:${INK};color:${BONE};text-decoration:none;font:500 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:999px;">See the other roles</a>
    </p>`;

  const footer = `
    <p style="margin:0 0 8px;">${escapeHtml(postalLine())}</p>
    <p style="margin:0;">You're getting this because you applied to work with 1127.
      <a href="${unsubUrl}" style="color:${MUTED};">Unsubscribe</a>.</p>`;

  const text = [
    `Thanks ${firstName}, we've got your application to work with 1127.`,
    "",
    "We read everything that comes in and reach out when there's a date that fits.",
    "",
    `Applied for: ${record.role || "Not given"}`,
    "",
    `${siteUrl()}/opportunities`,
    "",
    noReplyText(),
    postalLine(),
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");

  return {
    subject: "Your 1127 application",
    html: receiptShell({
      preheader: "We have your details.",
      heading: "Application received.",
      body,
      footer,
    }),
    text,
  };
}

export function renderTalentTeamEmail(record: SubmissionRecord, total: number) {
  const facts: Array<[string, string]> = [
    ["Role", record.role || "Not given"],
    ["Name", record.name || "Not given"],
    ["Email", record.email],
    ["Phone", record.phone || "Not given"],
    ["Links", record.social || "Not given"],
    ["Applications", String(total)],
  ];

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows(facts)}
    </table>
    ${
      record.message
        ? `<div style="margin:24px 0 0;padding:18px 20px;background:rgba(25,23,19,0.04);border-radius:14px;">
             <p style="margin:0 0 8px;font:500 11px/1.3 Helvetica,Arial,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">What they'd bring</p>
             <p style="margin:0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};white-space:pre-wrap;">${escapeHtml(record.message)}</p>
           </div>`
        : ""
    }
    <p style="margin:26px 0 0;">
      <a href="${siteUrl()}/admin/list" style="display:inline-block;background:${INK};color:${BONE};text-decoration:none;font:500 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:999px;">Open the applications</a>
    </p>`;

  const text = [
    `New 1127 application, ${record.role || "role not given"}`,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    record.message ? `What they'd bring:\n${record.message}` : "",
    "",
    `${siteUrl()}/admin/list`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${record.role || "Application"}, ${record.name || record.email}`,
    html: shell({
      preheader: `${record.name || record.email} applied. ${total} total.`,
      eyebrow: "Internal notification",
      heading: "New application.",
      body,
      footer: `<p style="margin:0;">Sent to the 1127 team. Recipients are set in content/site.ts under <code>notifications.talent</code>.</p>`,
    }),
    text,
  };
}

/** Talent applications notify the team and acknowledge the applicant. */
export async function notifyTalent(
  record: SubmissionRecord,
  total: number,
): Promise<void> {
  const status = emailStatus();

  if (status.guest && mayAcknowledge(record)) {
    await trySend(
      "Talent acknowledgement",
      [record.email],
      renderTalentApplicantEmail(record),
      NO_REPLY(),
    );
  }

  await trySend(
    "Talent team notification",
    recipients("talent"),
    renderTalentTeamEmail(record, total),
    record.email,
  );
}

/* -------------------------------------------------------------------------- */
/* Partner inquiries                                                           */
/* -------------------------------------------------------------------------- */

export function renderPartnerInquirerEmail(record: SubmissionRecord) {
  const firstName = (record.name || "").split(" ")[0] || "there";
  const unsubUrl = unsubscribeUrl(record.email);

  const body = `
    <p style="margin:0 0 16px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${INK};">Thanks ${escapeHtml(firstName)}, your message reached the 1127 team.</p>
    <p style="margin:0 0 26px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${MUTED};">Someone will read it properly and come back to you directly. Partnerships are built one conversation at a time, so we'd rather answer well than fast.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows([
        ["Company", record.company || "Not given"],
        ["About", record.inquiryType || "Not given"],
      ])}
    </table>`;

  const footer = `
    <p style="margin:0 0 8px;">${escapeHtml(postalLine())}</p>
    <p style="margin:0;">You're getting this because you contacted 1127.
      <a href="${unsubUrl}" style="color:${MUTED};">Unsubscribe</a>.</p>`;

  const text = [
    `Thanks ${firstName}, your message reached the 1127 team.`,
    "",
    "Someone will read it properly and come back to you directly.",
    "",
    `Company: ${record.company || "Not given"}`,
    `About: ${record.inquiryType || "Not given"}`,
    "",
    noReplyText(),
    postalLine(),
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");

  return {
    subject: "Your message to 1127",
    html: receiptShell({
      preheader: "Someone will come back to you directly.",
      heading: "Message received.",
      body,
      footer,
    }),
    text,
  };
}

export function renderPartnerTeamEmail(record: SubmissionRecord, total: number) {
  const facts: Array<[string, string]> = [
    ["Type", record.inquiryType || "Not given"],
    ["Company", record.company || "Not given"],
    ["Name", record.name || "Not given"],
    ["Email", record.email],
    ["Phone", record.phone || "Not given"],
    ["Inquiries", String(total)],
  ];

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(25,23,19,0.10);">
      ${factRows(facts)}
    </table>
    ${
      record.message
        ? `<div style="margin:24px 0 0;padding:18px 20px;background:rgba(25,23,19,0.04);border-radius:14px;">
             <p style="margin:0 0 8px;font:500 11px/1.3 Helvetica,Arial,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">Their message</p>
             <p style="margin:0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};white-space:pre-wrap;">${escapeHtml(record.message)}</p>
           </div>`
        : ""
    }
    <p style="margin:26px 0 0;">
      <a href="${siteUrl()}/admin/list" style="display:inline-block;background:${INK};color:${BONE};text-decoration:none;font:500 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:999px;">Open the inquiries</a>
    </p>`;

  const text = [
    `New 1127 partner inquiry, ${record.inquiryType || "type not given"}`,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    record.message ? `Their message:\n${record.message}` : "",
    "",
    `${siteUrl()}/admin/list`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${record.inquiryType || "Inquiry"}, ${record.company || record.name || record.email}`,
    html: shell({
      preheader: `${record.company || record.name || record.email} got in touch. ${total} total.`,
      eyebrow: "Internal notification",
      heading: "New partner inquiry.",
      body,
      footer: `<p style="margin:0;">Sent to the 1127 team. Recipients are set in content/site.ts under <code>notifications.partner</code>, or via PARTNER_NOTIFY_ADDRESS.</p>`,
    }),
    text,
  };
}

/**
 * Partner inquiries notify the team and acknowledge the sender.
 *
 * Note that `recipients("partner")` is empty until someone fills in
 * `notifications.partner` or sets PARTNER_NOTIFY_ADDRESS. trySend treats an
 * empty recipient list as a no-op, so the acknowledgement still goes out and
 * the record is still in the dashboard: only the internal alert is missing.
 */
export async function notifyPartner(
  record: SubmissionRecord,
  total: number,
): Promise<void> {
  const status = emailStatus();

  if (status.guest && mayAcknowledge(record)) {
    await trySend(
      "Partner acknowledgement",
      [record.email],
      renderPartnerInquirerEmail(record),
      NO_REPLY(),
    );
  }

  await trySend(
    "Partner team notification",
    recipients("partner"),
    renderPartnerTeamEmail(record, total),
    record.email,
  );
}

/* -------------------------------------------------------------------------- */
/* Campaigns                                                                   */
/* -------------------------------------------------------------------------- */

export type CampaignInput = {
  subject: string;
  /** Large line at the top. Blank falls back to the subject. */
  heading: string;
  /** Plain text; blank lines separate paragraphs. {name} and {event} fill in. */
  body: string;
};

/**
 * A campaign email for one recipient.
 *
 * This is the one kind of mail this app sends that IS bulk, so the rules are
 * the acknowledgements' rules inverted, deliberately: the designed shell with
 * the banner, because Promotions is the correct tab for a promo; the
 * The tickets themselves, sent the moment Square confirms payment.
 *
 * Transactional through and through: no List-Unsubscribe, no marketing CTA,
 * no opt-in check. Somebody who paid gets their tickets, full stop; even an
 * unsubscribed address receives what it bought. Each code admits one person
 * and is repeated in the plain-text part so it survives any mail client.
 */
export function renderTicketEmail(input: {
  eventName: string;
  tierName: string;
  quantity: number;
  totalLabel: string;
  codes: string[];
  date?: string;
  time?: string;
  location?: string;
  age21?: boolean;
  /** The wallet page showing one QR per screen; the door-night link. */
  walletUrl?: string;
}) {
  const subject = `Your ${input.eventName} ${input.quantity === 1 ? "ticket" : "tickets"}`;
  /**
   * Each code renders as a QR (scanned at the door) above the code itself
   * (the fallback when a camera or an image-blocking mail client fails).
   * The image lives at a URL because Gmail strips data: URIs.
   */
  const codeRows = input.codes
    .map(
      (code) =>
        `<div style="padding:12px 14px;background:rgba(25,23,19,0.05);border-radius:8px;margin:0 0 10px;text-align:center;">
          <img src="${siteUrl()}/api/ticket-qr/${encodeURIComponent(code)}" alt="QR for ${escapeHtml(code)}" width="160" height="160" style="display:block;margin:0 auto 8px;border-radius:6px;" />
          <div style="font:600 18px/1.4 'Courier New',monospace;letter-spacing:1px;color:${INK};">${escapeHtml(code)}</div>
        </div>`,
    )
    .join("");

  const meta = [
    input.date?.trim() ? escapeHtml(input.date.trim()) : null,
    input.time?.trim() ? escapeHtml(input.time.trim()) : null,
    input.location?.trim() ? escapeHtml(input.location.trim()) : null,
    input.age21 ? "21+ event" : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const html = receiptShell({
    preheader: `${input.quantity} x ${input.tierName} for ${input.eventName}.`,
    heading: "You're in.",
    body: `
      <p style="margin:0 0 6px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(`${input.quantity} x ${input.tierName}`)} for <strong>${escapeHtml(input.eventName)}</strong>. ${escapeHtml(input.totalLabel)} paid.</p>
      ${meta ? `<p style="margin:0 0 16px;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">${meta}</p>` : ""}
      ${
        input.walletUrl
          ? `<p style="margin:18px 0 0;"><a href="${input.walletUrl}" style="display:inline-block;background:${DEEP};color:${BONE};font:600 15px/1 Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:999px;text-decoration:none;">Show tickets at the door</a></p>
      <p style="margin:8px 0 0;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:${MUTED};">Opens each ticket full screen, one at a time, so the scanner reads the right one.</p>`
          : ""
      }
      <p style="margin:16px 0 10px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${INK};">Your ${input.codes.length === 1 ? "ticket" : "tickets"}, one per person, also right here:</p>
      ${codeRows}
      <p style="margin:16px 0 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">Keep this email. Nothing to print; the QR on a phone is enough, and the code under it works if the picture doesn't load.</p>`,
    footer: `This is your receipt for ${escapeHtml(input.totalLabel)}, paid by card.`,
  });

  const text = [
    `${input.quantity} x ${input.tierName} for ${input.eventName}. ${input.totalLabel} paid.`,
    meta ? meta.split(" &middot; ").join(", ") : "",
    "",
    `Your ${input.codes.length === 1 ? "code" : "codes"}, one per person, at the door:`,
    ...input.codes,
    "",
    "Keep this email. Nothing to print; the code on a phone is enough.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

/**
 * Sent to every ticket holder when an event's date or hours change. The one
 * email nobody can afford to miss, so it says the new schedule outright and
 * repeats that the tickets themselves are untouched.
 */
export function renderScheduleChangeEmail(input: {
  eventName: string;
  date?: string;
  time?: string;
  location?: string;
  walletUrl?: string;
}) {
  const subject = `${input.eventName}: schedule update`;
  const when = [
    input.date?.trim() ? escapeHtml(input.date.trim()) : null,
    input.time?.trim() ? escapeHtml(input.time.trim()) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const where = input.location?.trim() ? escapeHtml(input.location.trim()) : "";

  const html = receiptShell({
    preheader: `New schedule for ${input.eventName}.`,
    heading: "Schedule update",
    body: `
      <p style="margin:0 0 12px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};">The schedule for <strong>${escapeHtml(input.eventName)}</strong> changed. It now runs:</p>
      <p style="margin:0 0 6px;font:600 20px/1.4 Helvetica,Arial,sans-serif;color:${INK};">${when || "Date to be announced"}</p>
      ${where ? `<p style="margin:0 0 16px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">${where}</p>` : ""}
      <p style="margin:16px 0 0;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${INK};">Your tickets are unchanged and stay valid exactly as they are. Nothing to rebuy, nothing to reprint.</p>
      ${
        input.walletUrl
          ? `<p style="margin:18px 0 0;"><a href="${input.walletUrl}" style="display:inline-block;background:${DEEP};color:${BONE};font:600 15px/1 Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:999px;text-decoration:none;">See your tickets</a></p>`
          : ""
      }`,
    footer: `You're getting this because you hold tickets for ${escapeHtml(input.eventName)}.`,
  });

  const text = [
    `The schedule for ${input.eventName} changed. It now runs:`,
    [input.date?.trim(), input.time?.trim()].filter(Boolean).join(", ") ||
      "Date to be announced",
    input.location?.trim() ?? "",
    "",
    "Your tickets are unchanged and stay valid exactly as they are.",
    input.walletUrl ? `Your tickets: ${input.walletUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}

/**
 * The ambassador welcome: their link, their code, sent by one click from the
 * roster. Wording is editable on the dashboard; these are the defaults, and
 * {name}, {code} and {link} fill in wherever they appear.
 */
export const WELCOME_SUBJECT_DEFAULT = "Your 1127 ambassador link";
export const WELCOME_BODY_DEFAULT = [
  "Hey {name},",
  "You're officially a 1127 ambassador. Your personal link is below; put it in your bio and your stories, and everyone who signs up or buys tickets through it counts as yours.",
  "{link}",
  "Your code is {code}. People can also type it at checkout, so it works on flyers and screenshots too.",
  "Watch your own numbers any time, live: {stats}",
  "Thanks for repping us.",
].join("\n\n");

export function renderAmbassadorWelcomeEmail(input: {
  name: string;
  code: string;
  link: string;
  /** Their private stats page, for the {stats} placeholder. */
  statsLink?: string;
  /** The featured event's name, for the {event} placeholder. */
  eventName?: string;
  /** Absolute URLs of the marketing material, appended under the body. */
  kitImages?: string[];
  /** Blank falls back to the standard wording. */
  subject?: string;
  body?: string;
}) {
  const fill = (value: string) =>
    value
      .replace(/\{name\}/g, input.name.trim().split(/\s+/)[0] || "there")
      .replace(/\{code\}/g, input.code)
      .replace(/\{link\}/g, input.link)
      .replace(/\{stats\}/g, input.statsLink ?? "")
      .replace(/\{event\}/g, input.eventName ?? "the next event");

  const subject = fill(input.subject?.trim() || WELCOME_SUBJECT_DEFAULT);
  const bodyText = fill(input.body?.trim() || WELCOME_BODY_DEFAULT);

  const html = receiptShell({
    preheader: `Your link: ${input.link}`,
    heading: "Welcome aboard.",
    body: `
      ${bodyText
        .split(/\n{2,}/)
        .map(
          (para) =>
            `<p style="margin:0 0 14px;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(para.trim())}</p>`,
        )
        .join("")}
      <p style="margin:18px 0 0;"><a href="${input.link}" style="display:inline-block;background:${DEEP};color:${BONE};font:600 15px/1 Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:999px;text-decoration:none;">Open your link</a></p>
      ${
        input.kitImages?.length
          ? `<p style="margin:26px 0 6px;font:600 15px/1.4 Helvetica,Arial,sans-serif;color:${INK};">Material to post</p>
      <p style="margin:0 0 12px;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">Tap and hold an image to save it.</p>
      ${input.kitImages
        .map(
          (url) =>
            `<img src="${url}" alt="Post material" width="100%" style="display:block;max-width:100%;border-radius:10px;margin:0 0 12px;" />`,
        )
        .join("")}`
          : ""
      }`,
    footer: `You're getting this because you're a 1127 ambassador. Your code is ${escapeHtml(input.code)}.`,
  });

  const text = [
    bodyText,
    "",
    `Your link: ${input.link}`,
    ...(input.kitImages?.length
      ? ["", "Material to post:", ...input.kitImages]
      : []),
  ].join("\n");

  return { subject, html, text };
}

export async function sendAmbassadorWelcomeEmail(
  to: string,
  input: Parameters<typeof renderAmbassadorWelcomeEmail>[0],
): Promise<void> {
  const { subject, html, text } = renderAmbassadorWelcomeEmail(input);
  await sendDirect({ to: [to], subject, html, text });
}

export async function sendScheduleChangeEmail(
  to: string,
  input: Parameters<typeof renderScheduleChangeEmail>[0],
): Promise<void> {
  const { subject, html, text } = renderScheduleChangeEmail(input);
  await sendDirect({ to: [to], subject, html, text });
}

export async function sendTicketEmail(
  to: string,
  input: Parameters<typeof renderTicketEmail>[0],
): Promise<void> {
  const { subject, html, text } = renderTicketEmail(input);
  await sendDirect({ to: [to], subject, html, text });
}

/**
 * List-Unsubscribe header with One-Click, because Google requires it of bulk
 * senders and hiding from it burns the domain; a per-recipient unsubscribe
 * link, because CAN-SPAM requires a working opt-out in every message.
 *
 * Rendered per recipient rather than once, since the unsubscribe token and the
 * {name} greeting differ for each.
 */
export function renderCampaignEmail(
  input: CampaignInput,
  record: SubmissionRecord,
) {
  const unsubUrl = unsubscribeUrl(record.email);
  const firstName = record.name?.trim().split(/\s+/)[0] || "there";
  const fill = (value: string) => value.replace(/\{name\}/g, firstName);

  const subject = fill(input.subject.trim());
  const heading = fill(input.heading.trim() || input.subject.trim());
  const bodyText = fill(input.body.trim());

  const footer = `
    <p style="margin:0 0 8px;">${escapeHtml(postalLine())}</p>
    <p style="margin:0;">You're getting this because you joined the 1127 Events list.
      <a href="${unsubUrl}" style="color:${MUTED};">Unsubscribe</a>.</p>`;

  const text = [
    heading,
    "",
    bodyText,
    "",
    postalLine(),
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");

  return {
    subject,
    html: shell({
      preheader: bodyText.split("\n")[0]?.slice(0, 120) ?? subject,
      eyebrow: "1127 Events",
      heading,
      body: paragraphs(bodyText, INK),
      footer,
    }),
    text,
    listUnsubscribe: `<${unsubUrl}>`,
  };
}

/**
 * Sends one campaign message. Returns false rather than throwing, so a batch
 * reports how many failed instead of dying on the first.
 *
 * isMailable is re-checked here even though the audience was selected with it:
 * a batched send takes time, and somebody can unsubscribe between the audience
 * being computed and their message going out.
 */
export async function sendCampaignEmail(
  input: CampaignInput,
  record: SubmissionRecord,
): Promise<boolean> {
  if (!isMailable(record)) return false;

  try {
    const message = renderCampaignEmail(input, record);
    await send({
      to: [record.email],
      subject: message.subject,
      html: message.html,
      text: message.text,
      listUnsubscribe: message.listUnsubscribe,
    });
    return true;
  } catch (error) {
    console.error("[1127] campaign send failed", record.email, error);
    return false;
  }
}

/** The wrap-up note to the team once a campaign finishes. */
export async function notifyCampaignSent(
  input: CampaignInput,
  sent: number,
  failed: number,
): Promise<void> {
  await trySend(
    "Campaign summary",
    recipients("rsvp"),
    {
      subject: `Campaign sent: ${input.subject}`,
      html: shell({
        preheader: `${sent} sent, ${failed} failed.`,
        eyebrow: "1127 Events",
        heading: "Campaign sent.",
        body: `
          <p style="margin:0 0 14px;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:${INK};">Subject: ${escapeHtml(input.subject)}</p>
          <p style="margin:0 0 14px;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:${INK};">${sent} delivered to the list. ${failed > 0 ? `${failed} failed and were logged.` : "None failed."}</p>
          ${paragraphs(input.body, MUTED)}`,
        footer: `<p style="margin:0;">Internal summary. It exists so there is a record of what was sent and when.</p>`,
      }),
      text: `Campaign sent: ${input.subject}\n${sent} delivered, ${failed} failed.\n\n${input.body}`,
    },
  );
}

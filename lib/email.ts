import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { brand, contact, notifications } from "../content/site.ts";
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
 * Deliberately plain. `shell` below is a designed template: dark banner, accent
 * stripe, rounded card on a tinted background, nested tables. That is what a
 * newsletter looks like, and Gmail classifies on structure as much as wording,
 * so a confirmation wearing it gets filed under Promotions where nobody reads
 * it. A receipt from a bank or a ticket seller is close to plain text, and it
 * lands in the inbox.
 *
 * So: one table, no background fill, no banner, no accent colour, a wordmark in
 * text rather than a coloured bar. It still looks like it came from 1127, but
 * it looks like a receipt rather than a mailshot.
 *
 * Keep `shell` for genuine campaign sends, where Promotions is the right tab
 * and the design is worth having.
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
<body style="margin:0;padding:0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr>
        <td style="padding:0 0 20px;font:600 15px/1 Georgia,'Times New Roman',serif;color:${INK};">
          1127 Events
        </td>
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
          <span style="font:700 22px/1 Georgia,'Times New Roman',serif;color:${BONE};letter-spacing:-0.5px;">1127</span>
          <span style="display:inline-block;width:1px;height:14px;background:rgba(247,242,233,0.4);margin:0 10px;vertical-align:middle;"></span>
          <span style="font:500 11px/1 Helvetica,Arial,sans-serif;letter-spacing:0.2em;text-transform:uppercase;color:rgba(247,242,233,0.75);">Events</span>
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

  const name = event?.name ?? "Sun Club";
  const firstName = record.name.trim().split(/\s+/)[0] || "there";

  const facts: Array<[string, string]> = [
    ["Date", event?.date ?? "Dates announcing soon"],
    ["Location", event?.location ?? brand.region],
    ["Venue", event?.venue ?? "Announcing soon"],
    // Was hardcoded to "House", which told everyone signing up for a bass or
    // techno night the wrong thing. The event carries its genres; use them.
    ["Music", event?.genres?.length ? event.genres.join(", ") : "Announcing soon"],
  ];

  // Per-event wording when an admin has set it, the standard copy otherwise.
  // {name} is substituted so a custom line can still greet people by name
  // without the admin needing to know anything about templating.
  const fill = (value: string) =>
    value.replace(/\{name\}/g, firstName).replace(/\{event\}/g, name);

  const openingText = event?.emailHeading?.trim()
    ? fill(event.emailHeading.trim())
    : `Thanks ${firstName}, your RSVP for ${name} is confirmed.`;

  const bodyText = event?.emailBody?.trim()
    ? fill(event.emailBody.trim())
    : "We'll email you as soon as the next date is set. Nothing else, and never more than we'd want to receive ourselves.";

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
    <p style="margin:0;">You're getting this because you asked to hear about ${escapeHtml(name)} dates.
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
      : `You're confirmed for ${name}`,
    html: receiptShell({
      // This is the grey preview line next to the subject in an inbox list.
      // It should read as a receipt, because that is what this is.
      preheader: `Your RSVP for ${name} is confirmed.`,
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
    <p style="margin:0 0 16px;font:400 16px/1.65 Helvetica,Arial,sans-serif;color:${INK};">Thanks ${escapeHtml(firstName)}, your Sun Club ambassador application is in.</p>
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
    <p style="margin:0;">You're getting this because you applied to the Sun Club Ambassador Program.
      <a href="${unsubUrl}" style="color:${MUTED};">Unsubscribe</a>.</p>`;

  const text = [
    `Thanks ${firstName}, your Sun Club ambassador application is in.`,
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
    subject: "Your Sun Club ambassador application",
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
    "New Sun Club ambassador application",
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
    "New Sun Club RSVP",
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    `${siteUrl()}/admin/list`,
  ].join("\n");

  return {
    subject: `New RSVP, ${record.name || record.email}`,
    html: shell({
      preheader: `${record.email} joined the list. ${total} total.`,
      eyebrow: "Internal notification",
      heading: "New RSVP.",
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
export function mayEmail(record: SubmissionRecord): boolean {
  return record.status !== "unsubscribed" && record.status !== "bounced";
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

  if (status.guest && mayEmail(record)) {
    await trySend(
      "RSVP confirmation",
      [record.email],
      renderGuestEmail(record, event),
      NO_REPLY(),
    );
  }

  await trySend(
    "RSVP team notification",
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

  if (status.guest && mayEmail(record)) {
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
  const firstName = record.name.trim().split(/s+/)[0] || "there";

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

  if (status.guest && mayEmail(record)) {
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

  if (status.guest && mayEmail(record)) {
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

import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { brand } from "../content/site.ts";
import type { EventRecord, SubmissionRecord } from "./types.ts";

/**
 * Text messages via AWS End User Messaging (formerly Pinpoint SMS).
 *
 * Chosen over plain SNS for one reason: an opt-out list attaches to the sending
 * number, so AWS honours a STOP reply before a message ever reaches our code.
 * Opt-out handling is not a feature here, it is the law, and it is safer as a
 * property of the number than as something each send has to remember.
 *
 * Nothing sends until an origination identity is configured AND the number is
 * registered for A2P messaging. See DEPLOY.md.
 */

const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

/** Phone number ARN, pool ID, or sender ID that messages originate from. */
const ORIGINATION = () => process.env.SMS_ORIGINATION_IDENTITY?.trim();
const CONFIG_SET = () => process.env.SMS_CONFIGURATION_SET?.trim();

/**
 * The opt-out list attached to the origination phone number in AWS, which is
 * where STOP is actually honoured. It is not a per-message parameter, so this
 * variable is not passed to the API: it is a deliberate interlock. Setting it
 * is how you assert the list exists, and until you do, nothing sends.
 *
 * The failure it prevents is starting to text people before opt-out works.
 */
const OPT_OUT_LIST = () => process.env.SMS_OPT_OUT_LIST?.trim();

export type SmsStatus = { enabled: boolean; detail: string };

export function smsStatus(): SmsStatus {
  const origination = ORIGINATION();

  if (!origination) {
    return {
      enabled: false,
      detail:
        "SMS_ORIGINATION_IDENTITY is not set, so no texts are sent. Opt-ins are still recorded.",
    };
  }

  if (!OPT_OUT_LIST()) {
    return {
      enabled: false,
      detail:
        "SMS_OPT_OUT_LIST is not set. Texts are held back deliberately: it is how you confirm an opt-out list is attached to the sending number, and without one a STOP reply would go unhonoured.",
    };
  }

  return {
    enabled: true,
    detail: `Sending from ${origination}. STOP is honoured by AWS against the ${OPT_OUT_LIST()} opt-out list on that number.`,
  };
}

let client: PinpointSMSVoiceV2Client | null = null;
function sms(): PinpointSMSVoiceV2Client {
  if (!client) {
    client = new PinpointSMSVoiceV2Client({ region: region() });
  }
  return client;
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Normalises a typed phone number to E.164, which is the only format the API
 * accepts. Returns null rather than guessing when the input is ambiguous: a
 * wrong number is worse than no message, because it texts a stranger.
 *
 * Assumes a US number when no country code is present, matching where 1127
 * operates. Anything already carrying a "+" is passed through as given.
 */
export function toE164(input: string | undefined | null): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // E.164 allows at most 15 digits, and a country code needs at least 8 total
    // to be a plausible subscriber number.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // North American Numbering Plan: 10 digits, or 11 beginning with the country
  // code 1. An area code never starts with 0 or 1, which rules out junk.
  if (digits.length === 10 && !/^[01]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && !/^1[01]/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Whether a submission carries text-message consent.
 *
 * Entering a phone number is the opt-in, so this one predicate is the entire
 * rule. It gets its own function for two reasons: it is the line between a
 * message someone agreed to and one they did not, and it must be evaluated on
 * the server so a crafted payload can neither claim a consent that was never
 * given nor strip one that was.
 *
 * Deliberately tests for a number being present, not for it being dialable.
 * What is recorded here is what the person agreed to. Whether we can actually
 * reach that number is a separate question, answered by toE164 at send time.
 */
export function smsConsentFrom(phone: string | undefined | null): boolean {
  return typeof phone === "string" && phone.trim().length > 0;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/** A single GSM-7 segment. Staying inside it keeps cost and truncation risk at zero. */
export const SMS_SEGMENT_LIMIT = 160;

/**
 * The confirmation sent when someone opts in. It doubles as the opt-in receipt,
 * which is why it names the brand and repeats the STOP and HELP instructions:
 * carriers expect both in the first message of a programme.
 */
export function renderOptInSms(event: EventRecord | null): string {
  const name = event?.name ?? "1127 Events";
  return `${brand.shortName}: you're set for ${name} texts. We'll message when a date lands. Msg&data rates may apply. Reply STOP to cancel, HELP for help.`;
}

/** Announcement text. Kept to one segment; the detail lives on the site. */
export function renderDateSms(event: EventRecord): string {
  return `${brand.shortName}: ${event.name} is ${event.date}, ${event.location}. Details at ${brand.domain.replace(/^https?:\/\//, "")}/rsvp. Reply STOP to cancel.`;
}

/* -------------------------------------------------------------------------- */

/**
 * Fire and forget. Mirrors the email layer: a failed text must never lose a
 * signup, so every path swallows and logs.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const status = smsStatus();
  if (!status.enabled) return false;

  const destination = toE164(to);
  if (!destination) {
    console.warn("[1127] skipping SMS, could not read that number as E.164");
    return false;
  }

  try {
    await sms().send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: destination,
        OriginationIdentity: ORIGINATION(),
        MessageBody: body,
        // TRANSACTIONAL gets better delivery treatment and is the correct
        // classification for a confirmation someone just asked for.
        MessageType: "TRANSACTIONAL",
        ConfigurationSetName: CONFIG_SET(),
      }),
    );
    return true;
  } catch (error) {
    console.error("[1127] SMS send failed", error);
    return false;
  }
}

/**
 * Sends the opt-in confirmation, and only when the person actually ticked the
 * box. The check lives here as well as at the call site so there is no path
 * that texts someone who did not ask.
 */
export async function notifySmsOptIn(
  record: SubmissionRecord,
  event: EventRecord | null,
): Promise<void> {
  if (!record.smsOptIn) return;
  if (!record.phone) return;

  await sendSms(record.phone, renderOptInSms(event));
}

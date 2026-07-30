import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  SMS_SEGMENT_LIMIT,
  renderDateSms,
  renderOptInSms,
  smsConsentFrom,
  smsStatus,
  toE164,
} from "./sms.ts";
import { smsProgram } from "../content/site.ts";
import type { EventRecord } from "./types.ts";

describe("smsConsentFrom", () => {
  test("a number given is consent given", () => {
    assert.equal(smsConsentFrom("4805550142"), true);
    assert.equal(smsConsentFrom("+44 20 7946 0958"), true);
  });

  test("no number means no consent", () => {
    for (const input of ["", "   ", "\t\n", null, undefined]) {
      assert.equal(smsConsentFrom(input), false, `treated "${input}" as consent`);
    }
  });

  test("records what was agreed to, not what is dialable", () => {
    // "555" cannot be texted, but the person did type a number under the
    // disclosure. Consent is a fact about them; deliverability is our problem,
    // and toE164 is where it gets caught.
    assert.equal(smsConsentFrom("555"), true);
    assert.equal(toE164("555"), null);
  });

  test("ignores anything the client claims about the opt-in", () => {
    // The old model trusted a posted smsOptIn field. Nothing may reintroduce
    // that: a payload with no phone must not be able to assert consent, and a
    // payload with a phone must not be able to deny it.
    const forged = { phone: "", smsOptIn: "true" };
    const stripped = { phone: "4805550142", smsOptIn: "false" };
    assert.equal(smsConsentFrom(forged.phone), false);
    assert.equal(smsConsentFrom(stripped.phone), true);
  });
});

describe("the disclosure carriers will vet", () => {
  // A2P 10DLC review rejects opt-in flows missing any of these. They are cheap
  // to assert and expensive to discover during a campaign rejection.
  const text = smsProgram.disclosure;

  test("names the sender and what gets sent", () => {
    assert.match(text, /1127 Events/);
    assert.match(text, /dates/i);
  });

  test("carries frequency, rates and both keywords", () => {
    assert.match(text, /frequency varies/i);
    assert.match(text, /rates may apply/i);
    assert.match(text, /\bSTOP\b/);
    assert.match(text, /\bHELP\b/);
  });

  test("says texts are not a condition of entry", () => {
    assert.match(text, /not a condition/i);
  });

  test("says plainly that the number is the opt-in", () => {
    // The whole consent model rests on someone reading this and understanding
    // that typing a number is the agreement.
    assert.match(text, /adding your number opts you in/i);
  });
});

describe("toE164", () => {
  test("accepts the ways people actually type a US number", () => {
    for (const input of [
      "4805550142",
      "480 555 0142",
      "(480) 555-0142",
      "480-555-0142",
      "480.555.0142",
      "  480 555 0142  ",
      "14805550142",
      "1 (480) 555-0142",
    ]) {
      assert.equal(toE164(input), "+14805550142", `failed for "${input}"`);
    }
  });

  test("passes through an international number already in E.164", () => {
    assert.equal(toE164("+44 20 7946 0958"), "+442079460958");
    assert.equal(toE164("+61412345678"), "+61412345678");
  });

  test("refuses to guess rather than texting a stranger", () => {
    for (const input of [
      "",
      "   ",
      "not a number",
      "555",
      "0805550142", // area codes never start with 0
      "1805550142", // or 1
      "11805550142", // country code then a bad area code
      "123456789012345678", // too long for E.164
      "+123", // too short to be real
      null,
      undefined,
    ]) {
      assert.equal(toE164(input as string), null, `accepted "${input}"`);
    }
  });

  test("strips formatting without losing digits", () => {
    assert.equal(toE164("+1 (480) 555-0142"), "+14805550142");
  });
});

describe("message bodies", () => {
  const event: EventRecord = {
    id: "sun-club",
    name: "Sun Club",
    series: "1127 Events",
    tagline: "",
    summary: "",
    status: "",
    date: "Saturday, May 16",
    location: "Old Town Scottsdale",
    venue: null,
    tags: [],
    tone: "dusk",
    featured: true,
    published: true,
    order: 0,
    shotNote: "",
    image: null,
    imageAlt: "",
    ctaLabel: "",
    ctaAction: "rsvp",
    emailSubject: null,
    emailHeading: null,
    emailBody: null,
    createdAt: "",
    updatedAt: "",
  };

  test("the opt-in confirmation fits one segment", () => {
    const body = renderOptInSms(event);
    assert.ok(body.length <= SMS_SEGMENT_LIMIT, `${body.length} chars: "${body}"`);
  });

  test("the opt-in confirmation carries the required instructions", () => {
    const body = renderOptInSms(event);
    // Carriers expect the brand, STOP and HELP in the first message of a programme.
    assert.match(body, /1127/);
    assert.match(body, /STOP/);
    assert.match(body, /HELP/);
    assert.match(body, /rates may apply/i);
  });

  test("works before any event exists", () => {
    const body = renderOptInSms(null);
    assert.match(body, /Sun Club/);
    assert.ok(body.length <= SMS_SEGMENT_LIMIT);
  });

  test("the announcement fits one segment and carries STOP", () => {
    const body = renderDateSms(event);
    assert.ok(body.length <= SMS_SEGMENT_LIMIT, `${body.length} chars`);
    assert.match(body, /STOP/);
    assert.match(body, /Saturday, May 16/);
  });
});

describe("smsStatus", () => {
  const original = {
    origination: process.env.SMS_ORIGINATION_IDENTITY,
    optOut: process.env.SMS_OPT_OUT_LIST,
  };

  afterEach(() => {
    if (original.origination === undefined)
      delete process.env.SMS_ORIGINATION_IDENTITY;
    else process.env.SMS_ORIGINATION_IDENTITY = original.origination;
    if (original.optOut === undefined) delete process.env.SMS_OPT_OUT_LIST;
    else process.env.SMS_OPT_OUT_LIST = original.optOut;
  });

  test("off when there is nothing to send from", () => {
    delete process.env.SMS_ORIGINATION_IDENTITY;
    delete process.env.SMS_OPT_OUT_LIST;
    const status = smsStatus();
    assert.equal(status.enabled, false);
    assert.match(status.detail, /SMS_ORIGINATION_IDENTITY/);
  });

  test("stays off without an opt-out list, and says why", () => {
    process.env.SMS_ORIGINATION_IDENTITY =
      "arn:aws:sms-voice:us-west-1:1:phone-number/x";
    delete process.env.SMS_OPT_OUT_LIST;
    const status = smsStatus();
    assert.equal(status.enabled, false, "must not send where STOP is unhandled");
    assert.match(status.detail, /opt-out/i);
  });

  test("on only when both are configured", () => {
    process.env.SMS_ORIGINATION_IDENTITY =
      "arn:aws:sms-voice:us-west-1:1:phone-number/x";
    process.env.SMS_OPT_OUT_LIST = "1127-opt-outs";
    const status = smsStatus();
    assert.equal(status.enabled, true);
    assert.match(status.detail, /1127-opt-outs/);
  });
});

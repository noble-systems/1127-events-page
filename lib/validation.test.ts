import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  TALENT_ROLES,
  INQUIRY_TYPES,
  RULES,
  isFormType,
  validate,
} from "./validation.ts";

describe("validate", () => {
  test("flags every missing required field", () => {
    const errors = validate(RULES.partner, {});
    assert.deepEqual(Object.keys(errors).sort(), [
      "agreeTerms",
      "company",
      "email",
      "inquiryType",
      "message",
      "name",
    ]);
  });

  test("phone is optional but validated when present", () => {
    assert.equal(
      validate(RULES.rsvp, { name: "A", email: "a@b.co" }).phone,
      undefined,
    );
    assert.ok(
      validate(RULES.rsvp, { name: "A", email: "a@b.co", phone: "nope" }).phone,
    );
    assert.equal(
      validate(RULES.rsvp, { name: "A", email: "a@b.co", phone: "(480) 555-0142" })
        .phone,
      undefined,
    );
  });

  test("rejects malformed email addresses", () => {
    for (const email of ["plain", "no@tld", "@nolocal.com", "a b@c.com", ""]) {
      assert.ok(
        validate(RULES.rsvp, { name: "A", email }).email,
        `expected "${email}" to be rejected`,
      );
    }
  });

  test("accepts realistic email addresses", () => {
    for (const email of [
      "a@b.co",
      "first.last+tag@sub.domain.com",
      "DANIEL@1127.events",
    ]) {
      assert.equal(
        validate(RULES.rsvp, { name: "A", email }).email,
        undefined,
        `expected "${email}" to be accepted`,
      );
    }
  });

  test("select fields only accept listed options", () => {
    assert.ok(
      validate(RULES.partner, {
        name: "A",
        company: "C",
        email: "a@b.co",
        inquiryType: "Hacker",
        message: "x".repeat(30),
      }).inquiryType,
    );
  });

  test("an RSVP is one person: no group field is collected", () => {
    const fields = RULES.rsvp.map((rule) => rule.field);
    assert.deepEqual(fields, [
      "name",
      "email",
      "phone",
      "agreeTerms",
      "marketingOptIn",
    ]);
    assert.ok(!fields.includes("groupSize"));
    // smsOptIn is deliberately absent: text consent is derived from the phone
    // number on the server, so accepting it as a submitted field would let a
    // crafted payload set it. See smsConsentFrom in lib/sms.ts.
    assert.ok(!fields.includes("smsOptIn"));
    // A stray groupSize in the payload is simply ignored, not stored.
    assert.deepEqual(
      validate(RULES.rsvp, {
        name: "A",
        email: "a@b.co",
        agreeTerms: "true",
        groupSize: "10+",
      }),
      {},
    );
  });

  test("enforces minimum and maximum lengths", () => {
    const short = validate(RULES.partner, {
      name: "A",
      company: "C",
      email: "a@b.co",
      inquiryType: INQUIRY_TYPES[0],
      message: "too short",
    });
    assert.match(short.message ?? "", /at least 20/);

    const long = validate(RULES.rsvp, { name: "x".repeat(200), email: "a@b.co" });
    assert.match(long.name ?? "", /too long/i);
  });

  test("whitespace-only input counts as missing", () => {
    const errors = validate(RULES.rsvp, { name: "   ", email: "  " });
    assert.ok(errors.name);
    assert.ok(errors.email);
  });
});

describe("isFormType", () => {
  test("accepts the three real forms and nothing else", () => {
    for (const value of ["rsvp", "ambassador", "partner"]) {
      assert.equal(isFormType(value), true);
    }
    for (const value of ["admin", "", null, undefined, 1, {}]) {
      assert.equal(isFormType(value), false);
    }
  });
});

describe("talent applications", () => {
  const base = {
    name: "Alex",
    email: "a@b.co",
    role: TALENT_ROLES[0],
    message: "x".repeat(30),
  };

  test("accepts a complete application", () => {
    assert.deepEqual(validate(RULES.talent, { ...base, agreeTerms: "true" }), {});
  });

  test("requires a role from the published list", () => {
    assert.ok(validate(RULES.talent, { ...base, role: "" }).role);
    assert.ok(validate(RULES.talent, { ...base, role: "Astronaut" }).role);
    for (const role of TALENT_ROLES) {
      assert.equal(validate(RULES.talent, { ...base, role }).role, undefined);
    }
  });

  test("requires the free-text field to say something", () => {
    assert.match(
      validate(RULES.talent, { ...base, message: "hi" }).message ?? "",
      /at least 20/,
    );
  });

  test("links are optional", () => {
    assert.equal(validate(RULES.talent, base).social, undefined);
    assert.equal(
      validate(RULES.talent, { ...base, social: "soundcloud.com/x" }).social,
      undefined,
    );
  });

  test('"Something else" is a valid role, that is the catch-all', () => {
    assert.equal(
      validate(RULES.talent, { ...base, role: "Something else" }).role,
      undefined,
    );
  });
});

describe("consent capture", () => {
  const complete = {
    rsvp: { name: "A", email: "a@b.co" },
    talent: {
      name: "A",
      email: "a@b.co",
      role: TALENT_ROLES[0],
      message: "x".repeat(30),
    },
    ambassador: {
      name: "A",
      email: "a@b.co",
      community: "Nightlife",
      message: "x".repeat(30),
    },
    partner: {
      name: "A",
      company: "C",
      email: "a@b.co",
      inquiryType: INQUIRY_TYPES[0],
      message: "x".repeat(30),
    },
  } as const;

  test("every form refuses to submit without agreement", () => {
    for (const [form, values] of Object.entries(complete)) {
      const errors = validate(RULES[form as keyof typeof complete], values);
      assert.ok(
        errors.agreeTerms,
        `${form} accepted a submission with no agreement`,
      );
    }
  });

  test("an unticked box is not agreement", () => {
    // Values are trimmed like every other field, so " true " counts. What
    // matters is that nothing else does, including a differently-cased "TRUE".
    for (const bad of ["", "false", "no", "1", "yes", "on", "TRUE", "True"]) {
      const errors = validate(RULES.rsvp, { ...complete.rsvp, agreeTerms: bad });
      assert.ok(errors.agreeTerms, `"${bad}" was treated as agreement`);
    }
  });

  test("a ticked box passes", () => {
    for (const [form, values] of Object.entries(complete)) {
      const errors = validate(RULES[form as keyof typeof complete], {
        ...values,
        agreeTerms: "true",
      });
      assert.deepEqual(errors, {}, `${form} rejected a complete submission`);
    }
  });

  test("the opt-ins are optional and never block a submission", () => {
    for (const marketing of ["", "false", "true"]) {
      for (const sms of ["", "false", "true"]) {
        const errors = validate(RULES.rsvp, {
          ...complete.rsvp,
          agreeTerms: "true",
          marketingOptIn: marketing,
          smsOptIn: sms,
        });
        assert.deepEqual(errors, {});
      }
    }
  });
});

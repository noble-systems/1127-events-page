/**
 * Shared form validation.
 *
 * The exact same rules run in the browser (for instant, inline feedback) and
 * again in the API route, so a submitted payload is never trusted.
 */

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export type FormType = "rsvp" | "ambassador" | "partner" | "talent";

export type Rule = {
  field: string;
  label: string;
  required?: boolean;
  kind?: "text" | "email" | "phone" | "select" | "checkbox";
  min?: number;
  max?: number;
  oneOf?: readonly string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

export function validate(rules: readonly Rule[], values: FormValues): FormErrors {
  const errors: FormErrors = {};

  for (const rule of rules) {
    const raw = values[rule.field] ?? "";
    const value = raw.trim();

    if (rule.kind === "checkbox") {
      if (rule.required && value !== "true") {
        errors[rule.field] = `${rule.label} is required.`;
      }
      continue;
    }

    if (rule.required && !value) {
      errors[rule.field] =
        rule.kind === "select"
          ? `Please choose a ${rule.label.toLowerCase()}.`
          : `${rule.label} is required.`;
      continue;
    }

    if (!value) continue;

    if (rule.kind === "email" && !EMAIL_RE.test(value)) {
      errors[rule.field] = "Enter a valid email address.";
      continue;
    }

    if (rule.kind === "phone" && !PHONE_RE.test(value)) {
      errors[rule.field] = "Enter a valid phone number, or leave it blank.";
      continue;
    }

    if (rule.oneOf && !rule.oneOf.includes(value)) {
      errors[rule.field] = `Choose one of the listed options.`;
      continue;
    }

    if (rule.min && value.length < rule.min) {
      errors[rule.field] =
        `Please add a little more detail (at least ${rule.min} characters).`;
      continue;
    }

    if (rule.max && value.length > rule.max) {
      errors[rule.field] =
        `${rule.label} is too long (max ${rule.max} characters).`;
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Rule sets, one per form                                                    */
/* -------------------------------------------------------------------------- */

export const AMBASSADOR_COMMUNITIES = [
  "Nightlife",
  "Hospitality",
  "Fashion",
  "Fitness",
  "Beauty & lifestyle",
  "College & young professional",
  "Other",
] as const;

export const INQUIRY_TYPES = [
  "Venue",
  "Brand or sponsor",
  "DJ or artist",
  "Vendor",
  "Media",
  "Other",
] as const;

/**
 * Roles people can apply for at /opportunities. "Something else" is the catch-all
 *, whatever they pick, the free-text field is where they say what they bring.
 */
export const TALENT_ROLES = [
  "DJ",
  "Audio technician",
  "Promoter / street team",
  "Photographer / videographer",
  "Event staff / hospitality",
  "Production crew",
  "Something else",
] as const;

export const RULES: Record<FormType, readonly Rule[]> = {
  // Only the RSVP form carries a marketing opt-in. The other three collect a
  // working contact, not an audience: asking them to join a list we would never
  // send to would be collecting consent for nothing.
  rsvp: [
    { field: "name", label: "Name", required: true, max: 120 },
    { field: "email", label: "Email", required: true, kind: "email", max: 200 },
    { field: "phone", label: "Phone", kind: "phone" },
    {
      field: "agreeTerms",
      label: "Agreeing to the terms and privacy policy",
      required: true,
      kind: "checkbox",
    },
    // Not offered on the RSVP form: joining the list IS the email opt-in, and a
    // required "do you want the emails" box on a form whose only purpose is the
    // emails would be theatre. Recorded as true by the form instead.
    { field: "marketingOptIn", label: "Email opt-in", kind: "checkbox" },
    // Which event this signup came from. Not shown to the guest; the RSVP page
    // reads it from the link they followed. Optional, because somebody landing
    // on /rsvp directly still needs to be able to sign up.
    { field: "eventId", label: "Event", max: 80 },
  ],
  ambassador: [
    { field: "name", label: "Name", required: true, max: 120 },
    { field: "email", label: "Email", required: true, kind: "email", max: 200 },
    { field: "phone", label: "Phone", kind: "phone" },
    { field: "social", label: "Social handle", max: 120 },
    {
      field: "community",
      label: "community",
      required: true,
      kind: "select",
      oneOf: AMBASSADOR_COMMUNITIES,
    },
    {
      field: "message",
      label: "About you",
      required: true,
      min: 20,
      max: 1500,
    },
    {
      field: "agreeTerms",
      label: "Agreeing to the terms and privacy policy",
      required: true,
      kind: "checkbox",
    },
  ],
  talent: [
    { field: "name", label: "Name", required: true, max: 120 },
    { field: "email", label: "Email", required: true, kind: "email", max: 200 },
    { field: "phone", label: "Phone", kind: "phone" },
    {
      field: "role",
      label: "role",
      required: true,
      kind: "select",
      oneOf: TALENT_ROLES,
    },
    { field: "social", label: "Links", max: 400 },
    {
      field: "message",
      label: "What you'd bring",
      required: true,
      min: 20,
      max: 2000,
    },
    {
      field: "agreeTerms",
      label: "Agreeing to the terms and privacy policy",
      required: true,
      kind: "checkbox",
    },
  ],
  partner: [
    { field: "name", label: "Name", required: true, max: 120 },
    {
      field: "company",
      label: "Company or organization",
      required: true,
      max: 160,
    },
    { field: "email", label: "Email", required: true, kind: "email", max: 200 },
    { field: "phone", label: "Phone", kind: "phone" },
    {
      field: "inquiryType",
      label: "inquiry type",
      required: true,
      kind: "select",
      oneOf: INQUIRY_TYPES,
    },
    { field: "message", label: "Message", required: true, min: 20, max: 2000 },
    {
      field: "agreeTerms",
      label: "Agreeing to the terms and privacy policy",
      required: true,
      kind: "checkbox",
    },
  ],
};

export function isFormType(value: unknown): value is FormType {
  return (
    value === "rsvp" ||
    value === "ambassador" ||
    value === "partner" ||
    value === "talent"
  );
}

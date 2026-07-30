"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TALENT_ROLES } from "@/lib/validation";
import {
  Field,
  FormAlert,
  FormSuccess,
  Honeypot,
  MarketingCheckbox,
  SmsDisclosure,
  Spinner,
  TextArea,
  TermsCheckbox,
  TextInput,
} from "./Fields";
import { useForm } from "./useForm";

const INITIAL = {
  name: "",
  email: "",
  phone: "",
  role: "",
  social: "",
  message: "",
  agreeTerms: "false",
  marketingOptIn: "false",
};

/** Hint shown under the free-text field, tuned to the selected role. */
const PROMPT: Record<string, string> = {
  DJ: "Where you play, what you play, and a link to a mix or two.",
  "Audio technician":
    "Systems you've run, room sizes, and the kind of days you're used to.",
  "Promoter / street team":
    "The circles you reach and how you've filled a room before.",
  "Photographer / videographer":
    "What you shoot, how fast you turn it around, and where to see it.",
  "Event staff / hospitality":
    "Where you've worked and what you're good at on a busy day.",
  "Production crew": "Load-ins, rigging, power, staging. Whatever you have done.",
  "Something else":
    "Tell us what you do and where it fits. This is the important bit.",
};

const DEFAULT_PROMPT =
  "Experience, the rooms you have worked, links. Whatever makes the case.";

export function TalentForm() {
  const [trap, setTrap] = useState("");
  const { values, errors, status, errorMessage, setField, reset, handleSubmit } =
    useForm("talent", INITIAL);

  if (status === "success") {
    return (
      <FormSuccess
        title="Application received."
        body="We read everything that comes in and reach out when there's a date that fits. Bookings are made per event, so it may be a little while."
        actionLabel="Submit another"
        onAction={reset}
      />
    );
  }

  const busy = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="relative space-y-6">
      <Honeypot value={trap} onChange={setTrap} />

      {status === "error" && errorMessage ? (
        <FormAlert message={errorMessage} />
      ) : null}

      {/* Role is a radio group rather than a <select>: it's the first decision
          on the page, and seeing the options is the point. */}
      <fieldset>
        <legend className="label-xs text-ink/70 mb-3">
          What are you applying for?
        </legend>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {TALENT_ROLES.map((role, index) => {
            const selected = values.role === role;
            // An odd count would leave the last option stranded in a half row.
            const spansRow =
              index === TALENT_ROLES.length - 1 && TALENT_ROLES.length % 2 === 1;
            return (
              <label
                key={role}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-200 ${
                  spansRow ? "sm:col-span-2" : ""
                } ${
                  selected
                    ? "border-ink bg-ink text-bone"
                    : "border-ink/15 bg-bone-soft hover:border-ink/35"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={selected}
                  disabled={busy}
                  onChange={() => setField("role", role)}
                  className="accent-cobalt h-4 w-4 shrink-0"
                />
                <span className="text-[0.9375rem]">{role}</span>
              </label>
            );
          })}
        </div>

        {errors.role ? (
          <p className="text-terracotta-deep mt-2.5 text-[0.8125rem]">
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="tal-name" label="Name" error={errors.name}>
          <TextInput
            id="tal-name"
            name="name"
            autoComplete="name"
            placeholder="Your name or artist name"
            value={values.name}
            error={errors.name}
            disabled={busy}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>

        <Field id="tal-email" label="Email" error={errors.email}>
          <TextInput
            id="tal-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={values.email}
            error={errors.email}
            disabled={busy}
            onChange={(event) => setField("email", event.target.value)}
          />
        </Field>

        <Field id="tal-phone" label="Phone" optional error={errors.phone}>
          <TextInput
            id="tal-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Best number to reach you"
            value={values.phone}
            error={errors.phone}
            disabled={busy}
            onChange={(event) => setField("phone", event.target.value)}
          />
        </Field>

        <Field
          id="tal-links"
          label="Links"
          optional
          error={errors.social}
          hint="Mixes, portfolio, Instagram. Whatever shows the work."
        >
          <TextInput
            id="tal-links"
            name="social"
            placeholder="soundcloud.com/… , @yourhandle"
            value={values.social}
            error={errors.social}
            disabled={busy}
            onChange={(event) => setField("social", event.target.value)}
          />
        </Field>
      </div>

      <SmsDisclosure />

      <Field
        id="tal-message"
        label="What you'd bring"
        error={errors.message}
        hint={values.role ? PROMPT[values.role] : DEFAULT_PROMPT}
      >
        <TextArea
          id="tal-message"
          name="message"
          rows={6}
          placeholder="I've been playing house around Phoenix for…"
          value={values.message}
          error={errors.message}
          disabled={busy}
          onChange={(event) => setField("message", event.target.value)}
        />
      </Field>

      <div className="space-y-3">
        <TermsCheckbox
          idPrefix="tal"
          checked={values.agreeTerms === "true"}
          disabled={busy}
          error={errors.agreeTerms}
          onChange={(checked) => setField("agreeTerms", String(checked))}
        />

        <MarketingCheckbox
          idPrefix="tal"
          checked={values.marketingOptIn === "true"}
          disabled={busy}
          onChange={(checked) => setField("marketingOptIn", String(checked))}
        />
      </div>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Sending…" : "Submit application"}
        </Button>
        <p className="text-ink/65 text-[0.8125rem] leading-relaxed">
          Goes straight to the 1127 team.
        </p>
      </div>
    </form>
  );
}

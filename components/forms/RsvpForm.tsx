"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Field,
  FormAlert,
  FormSuccess,
  Honeypot,
  SmsDisclosure,
  Spinner,
  TermsCheckbox,
  TextInput,
} from "./Fields";
import { useForm } from "./useForm";

const INITIAL = {
  name: "",
  email: "",
  phone: "",
  agreeTerms: "false",
  // Joining this list is the email opt-in, so it is recorded rather than asked.
  marketingOptIn: "true",
  eventId: "",
};

/**
 * One person, one signup. There is deliberately no "how many are you bringing"
 * field: a group counted on one form is a group of email addresses we never
 * got. The success state asks people to pass the link on instead.
 */
export function RsvpForm({
  onDone,
  eventId = "",
}: {
  onDone?: () => void;
  /**
   * Which event this signup should be attributed to. Resolved on the server
   * from ?event= or, failing that, whichever event is featured. Never shown to
   * the guest: the form stays three fields.
   */
  eventId?: string;
}) {
  const [trap, setTrap] = useState("");
  const { values, errors, status, errorMessage, setField, reset, handleSubmit } =
    useForm("rsvp", { ...INITIAL, eventId });

  if (status === "success") {
    return (
      <FormSuccess
        title="You're on the list."
        body="We'll email you as soon as the next date is set, before it goes public. Bringing people? Send them the link so they get their own spot."
        actionLabel={onDone ? "Close" : "Add someone else"}
        onAction={() => {
          reset();
          onDone?.();
        }}
      />
    );
  }

  const busy = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="relative space-y-5">
      <Honeypot value={trap} onChange={setTrap} />

      {status === "error" && errorMessage ? (
        <FormAlert message={errorMessage} />
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="rsvp-name" label="Name" error={errors.name}>
          <TextInput
            id="rsvp-name"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            value={values.name}
            error={errors.name}
            disabled={busy}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>

        <Field id="rsvp-email" label="Email" error={errors.email}>
          <TextInput
            id="rsvp-email"
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
      </div>

      <Field id="rsvp-phone" label="Phone" optional error={errors.phone}>
        <TextInput
          id="rsvp-phone"
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

      <SmsDisclosure />

      <div className="space-y-3">
        <TermsCheckbox
          idPrefix="rsvp"
          checked={values.agreeTerms === "true"}
          disabled={busy}
          error={errors.agreeTerms}
          onChange={(checked) => setField("agreeTerms", String(checked))}
        />
      </div>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" variant="sun" size="lg" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Sending…" : "Join the list"}
        </Button>
        <p className="text-ink/65 text-[0.8125rem] leading-relaxed">
          One spot per person. Event news only, no resale.
        </p>
      </div>
    </form>
  );
}

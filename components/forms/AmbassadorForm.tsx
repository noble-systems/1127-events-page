"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AMBASSADOR_COMMUNITIES } from "@/lib/validation";
import {
  CheckboxField,
  Field,
  FormAlert,
  FormSuccess,
  Honeypot,
  Select,
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
  social: "",
  community: "",
  message: "",
  agreeTerms: "false",
  marketingOptIn: "false",
};

export function AmbassadorForm({ onDone }: { onDone?: () => void }) {
  const [trap, setTrap] = useState("");
  const { values, errors, status, errorMessage, setField, reset, handleSubmit } =
    useForm("ambassador", INITIAL);

  if (status === "success") {
    return (
      <FormSuccess
        title="Application received."
        body="We review applications ahead of every Sun Club date and reach out directly to the people we'd like to work with."
        actionLabel={onDone ? "Close" : "Submit another"}
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
        <Field id="amb-name" label="Name" error={errors.name}>
          <TextInput
            id="amb-name"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            value={values.name}
            error={errors.name}
            disabled={busy}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>

        <Field id="amb-email" label="Email" error={errors.email}>
          <TextInput
            id="amb-email"
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

        <Field id="amb-phone" label="Phone" optional error={errors.phone}>
          <TextInput
            id="amb-phone"
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

        <Field id="amb-social" label="Social handle" optional error={errors.social}>
          <TextInput
            id="amb-social"
            name="social"
            placeholder="@yourhandle"
            value={values.social}
            error={errors.social}
            disabled={busy}
            onChange={(event) => setField("social", event.target.value)}
          />
        </Field>
      </div>

      <SmsDisclosure />

      <Field
        id="amb-community"
        label="Your community"
        error={errors.community}
        hint="Where most of your circle comes from."
      >
        <Select
          id="amb-community"
          name="community"
          options={AMBASSADOR_COMMUNITIES}
          placeholder="Select a community"
          value={values.community}
          error={errors.community}
          disabled={busy}
          onChange={(event) => setField("community", event.target.value)}
        />
      </Field>

      <Field
        id="amb-message"
        label="Tell us about your circles"
        error={errors.message}
        hint="Who you bring, where you're connected, what you're into. A few sentences is plenty."
      >
        <TextArea
          id="amb-message"
          name="message"
          placeholder="I work in hospitality in Old Town and usually roll with a group of…"
          value={values.message}
          error={errors.message}
          disabled={busy}
          onChange={(event) => setField("message", event.target.value)}
        />
      </Field>

      <div className="space-y-3">
        <TermsCheckbox
          idPrefix="amb"
          checked={values.agreeTerms === "true"}
          disabled={busy}
          error={errors.agreeTerms}
          onChange={(checked) => setField("agreeTerms", String(checked))}
        />

        <CheckboxField
          id="amb-marketing"
          name="marketingOptIn"
          checked={values.marketingOptIn === "true"}
          disabled={busy}
          onChange={(checked) => setField("marketingOptIn", String(checked))}
        >
          Also add me to the Sun Club list so I hear about upcoming dates. Optional,
          and one click to leave.
        </CheckboxField>
      </div>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Sending…" : "Submit application"}
        </Button>
        <p className="text-ink/65 text-[0.8125rem] leading-relaxed">
          Applications are reviewed before each date.
        </p>
      </div>
    </form>
  );
}

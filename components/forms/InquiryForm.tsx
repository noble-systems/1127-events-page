"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { INQUIRY_TYPES } from "@/lib/validation";
import {
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
  company: "",
  email: "",
  phone: "",
  inquiryType: "",
  message: "",
  agreeTerms: "false",
};

export function InquiryForm() {
  const [trap, setTrap] = useState("");
  const { values, errors, status, errorMessage, setField, reset, handleSubmit } =
    useForm("partner", INITIAL);

  if (status === "success") {
    return (
      <FormSuccess
        title="Thanks, that's with us."
        body="We read every inquiry and reply personally with next steps. If it's time-sensitive, say so in a follow-up and we'll move it up."
        actionLabel="Send another inquiry"
        onAction={reset}
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
        <Field id="inq-name" label="Name" error={errors.name}>
          <TextInput
            id="inq-name"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            value={values.name}
            error={errors.name}
            disabled={busy}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>

        <Field
          id="inq-company"
          label="Company or organization"
          error={errors.company}
        >
          <TextInput
            id="inq-company"
            name="company"
            autoComplete="organization"
            placeholder="Venue, brand or artist name"
            value={values.company}
            error={errors.company}
            disabled={busy}
            onChange={(event) => setField("company", event.target.value)}
          />
        </Field>

        <Field id="inq-email" label="Email" error={errors.email}>
          <TextInput
            id="inq-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={values.email}
            error={errors.email}
            disabled={busy}
            onChange={(event) => setField("email", event.target.value)}
          />
        </Field>

        <Field id="inq-phone" label="Phone" optional error={errors.phone}>
          <TextInput
            id="inq-phone"
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
      </div>

      <SmsDisclosure />

      <Field id="inq-type" label="Type of inquiry" error={errors.inquiryType}>
        <Select
          id="inq-type"
          name="inquiryType"
          options={INQUIRY_TYPES}
          placeholder="What brings you here?"
          value={values.inquiryType}
          error={errors.inquiryType}
          disabled={busy}
          onChange={(event) => setField("inquiryType", event.target.value)}
        />
      </Field>

      <Field
        id="inq-message"
        label="Message"
        error={errors.message}
        hint="The room, the dates you're thinking about, capacity, or whatever's on your mind."
      >
        <TextArea
          id="inq-message"
          name="message"
          rows={6}
          placeholder="We run a pool deck in Old Town with room for…"
          value={values.message}
          error={errors.message}
          disabled={busy}
          onChange={(event) => setField("message", event.target.value)}
        />
      </Field>

      <div className="space-y-3">
        <TermsCheckbox
          idPrefix="inq"
          checked={values.agreeTerms === "true"}
          disabled={busy}
          error={errors.agreeTerms}
          onChange={(checked) => setField("agreeTerms", String(checked))}
        />
      </div>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Sending…" : "Send inquiry"}
        </Button>
        <p className="text-ink/65 text-[0.8125rem] leading-relaxed">
          Goes straight to the 1127 team.
        </p>
      </div>
    </form>
  );
}

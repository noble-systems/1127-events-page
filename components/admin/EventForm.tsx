"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Field,
  FormAlert,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/forms/Fields";
import { Button } from "@/components/ui/Button";
import { toneBackground } from "@/components/ui/Media";
import {
  EMPTY_EVENT,
  type EventFormValues,
  validateEvent,
} from "@/lib/event-input";
import { MEDIA_TONES } from "@/lib/types";
import type { FormErrors } from "@/lib/validation";

function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="border-ink/15 bg-bone-soft hover:border-ink/30 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-200"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-cobalt mt-0.5 h-4 w-4 shrink-0"
      />
      <span>
        <span className="block text-[0.9375rem] font-medium">{label}</span>
        <span className="text-ink/65 mt-1 block text-[0.8125rem] leading-relaxed">
          {hint}
        </span>
      </span>
    </label>
  );
}

export function EventForm({
  initial,
  eventId,
}: {
  initial?: EventFormValues;
  eventId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>(initial ?? EMPTY_EVENT);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = <K extends keyof EventFormValues>(
    key: K,
    value: EventFormValues[K],
  ) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (touched) setErrors(validateEvent(next));
      return next;
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    setMessage(null);

    const nextErrors = validateEvent(values);
    setErrors(nextErrors);

    const first = Object.keys(nextErrors)[0];
    if (first) {
      event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        eventId ? `/api/admin/events/${eventId}` : "/api/admin/events",
        {
          method: eventId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        errors?: FormErrors;
        message?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        if (data?.errors) setErrors(data.errors);
        setMessage(data?.message ?? "Couldn't save that. Please try again.");
        setBusy(false);
        return;
      }

      router.push("/admin/events");
      router.refresh();
    } catch {
      setMessage("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      {message ? <FormAlert message={message} /> : null}

      <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
        <h2 className="font-display text-xl">The basics</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field id="ev-name" label="Name" error={errors.name}>
            <TextInput
              id="ev-name"
              name="name"
              placeholder="Sun Club"
              value={values.name}
              error={errors.name}
              disabled={busy}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          <Field
            id="ev-series"
            label="Series"
            error={errors.series}
            hint="Shown above the name on the card."
          >
            <TextInput
              id="ev-series"
              name="series"
              value={values.series}
              error={errors.series}
              disabled={busy}
              onChange={(e) => set("series", e.target.value)}
            />
          </Field>

          <Field
            id="ev-tagline"
            label="Tagline"
            error={errors.tagline}
            className="sm:col-span-2"
          >
            <TextInput
              id="ev-tagline"
              name="tagline"
              placeholder="House music under the desert sun."
              value={values.tagline}
              error={errors.tagline}
              disabled={busy}
              onChange={(e) => set("tagline", e.target.value)}
            />
          </Field>

          <Field
            id="ev-summary"
            label="Summary"
            error={errors.summary}
            hint="Two or three sentences on the card."
            className="sm:col-span-2"
          >
            <TextArea
              id="ev-summary"
              name="summary"
              rows={4}
              value={values.summary}
              error={errors.summary}
              disabled={busy}
              onChange={(e) => set("summary", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
        <h2 className="font-display text-xl">When and where</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            id="ev-date"
            label="Date"
            error={errors.date}
            hint='Free text, "Dates Announcing Soon" is fine until one is confirmed.'
          >
            <TextInput
              id="ev-date"
              name="date"
              value={values.date}
              error={errors.date}
              disabled={busy}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>

          <Field
            id="ev-status"
            label="Status badge"
            error={errors.status}
            hint="Small label on the image, e.g. Featured series."
          >
            <TextInput
              id="ev-status"
              name="status"
              value={values.status}
              error={errors.status}
              disabled={busy}
              onChange={(e) => set("status", e.target.value)}
            />
          </Field>

          <Field id="ev-location" label="Location" error={errors.location}>
            <TextInput
              id="ev-location"
              name="location"
              value={values.location}
              error={errors.location}
              disabled={busy}
              onChange={(e) => set("location", e.target.value)}
            />
          </Field>

          <Field
            id="ev-venue"
            label="Venue"
            optional
            error={errors.venue}
            hint='Leave blank to show "Announcing soon".'
          >
            <TextInput
              id="ev-venue"
              name="venue"
              value={values.venue}
              error={errors.venue}
              disabled={busy}
              onChange={(e) => set("venue", e.target.value)}
            />
          </Field>

          <Field
            id="ev-tags"
            label="Tags"
            error={errors.tags}
            hint="Comma separated, up to 8."
            className="sm:col-span-2"
          >
            <TextInput
              id="ev-tags"
              name="tags"
              placeholder="House music, Poolside, Day into golden hour"
              value={values.tags}
              error={errors.tags}
              disabled={busy}
              onChange={(e) => set("tags", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
        <h2 className="font-display text-xl">Artwork</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            id="ev-tone"
            label="Placeholder palette"
            error={errors.tone}
            hint="Used until a real photo is added."
          >
            <Select
              id="ev-tone"
              name="tone"
              options={MEDIA_TONES}
              placeholder="Choose a palette"
              value={values.tone}
              error={errors.tone}
              disabled={busy}
              onChange={(e) => set("tone", e.target.value)}
            />
          </Field>

          <div className="flex items-end">
            <span
              aria-hidden="true"
              className="ring-ink/12 h-[3.25rem] w-full rounded-xl ring-1"
              style={{
                backgroundImage: MEDIA_TONES.includes(
                  values.tone as (typeof MEDIA_TONES)[number],
                )
                  ? toneBackground(values.tone as (typeof MEDIA_TONES)[number])
                  : undefined,
              }}
            />
          </div>

          <Field
            id="ev-image"
            label="Photo path"
            optional
            error={errors.image}
            hint="Upload to /public/media and reference it, e.g. /media/sun-club-01.jpg"
          >
            <TextInput
              id="ev-image"
              name="image"
              placeholder="/media/sun-club-01.jpg"
              value={values.image}
              error={errors.image}
              disabled={busy}
              onChange={(e) => set("image", e.target.value)}
            />
          </Field>

          <Field
            id="ev-image-alt"
            label="Image alt text"
            error={errors.imageAlt}
            hint="Describes the photo for screen readers."
          >
            <TextInput
              id="ev-image-alt"
              name="imageAlt"
              value={values.imageAlt}
              error={errors.imageAlt}
              disabled={busy}
              onChange={(e) => set("imageAlt", e.target.value)}
            />
          </Field>

          <Field
            id="ev-shot-note"
            label="Shot note"
            optional
            error={errors.shotNote}
            hint="Caption shown on the placeholder, the shot you want here."
            className="sm:col-span-2"
          >
            <TextInput
              id="ev-shot-note"
              name="shotNote"
              placeholder="Crowd at the water's edge, afternoon"
              value={values.shotNote}
              error={errors.shotNote}
              disabled={busy}
              onChange={(e) => set("shotNote", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
        <h2 className="font-display text-xl">Button and placement</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field id="ev-cta-label" label="Button label" error={errors.ctaLabel}>
            <TextInput
              id="ev-cta-label"
              name="ctaLabel"
              value={values.ctaLabel}
              error={errors.ctaLabel}
              disabled={busy}
              onChange={(e) => set("ctaLabel", e.target.value)}
            />
          </Field>

          <Field id="ev-cta-action" label="Button goes to" error={errors.ctaAction}>
            <Select
              id="ev-cta-action"
              name="ctaAction"
              options={["rsvp", "partner"]}
              placeholder="Choose a destination"
              value={values.ctaAction}
              error={errors.ctaAction}
              disabled={busy}
              onChange={(e) => set("ctaAction", e.target.value)}
            />
          </Field>

          <Field
            id="ev-order"
            label="Order"
            error={errors.order}
            hint="Lower numbers appear first."
          >
            <TextInput
              id="ev-order"
              name="order"
              type="number"
              min={0}
              max={999}
              value={values.order}
              error={errors.order}
              disabled={busy}
              onChange={(e) => set("order", e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Toggle
              id="ev-featured"
              label="Featured card"
              hint="Large two-column treatment. Use it for one event at a time."
              checked={values.featured}
              disabled={busy}
              onChange={(value) => set("featured", value)}
            />
            <Toggle
              id="ev-published"
              label="Published"
              hint="Off keeps it as a draft, hidden from the public site."
              checked={values.published}
              disabled={busy}
              onChange={(value) => set("published", value)}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving…" : eventId ? "Save changes" : "Create event"}
        </Button>
        <Link
          href="/admin/events"
          className="border-ink/20 hover:border-ink/45 rounded-full border px-5 py-3 text-[0.9375rem] transition-colors duration-200"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

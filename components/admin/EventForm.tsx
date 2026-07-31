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
  genreList,
}: {
  initial?: EventFormValues;
  eventId?: string;
  /** The genres currently in use, from the store. */
  genreList: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>(initial ?? EMPTY_EVENT);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /**
   * Two steps: ask the server to presign a PUT, then send the bytes straight to
   * S3. The file never goes through the app, which is what keeps a large
   * photograph from hitting the Lambda request body limit.
   */
  const upload = async (file: File) => {
    setUploadError(null);
    setUploading(true);

    try {
      const signed = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          filename: file.name,
          contentType: file.type,
        }),
      });

      const data = (await signed.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        ref?: string;
        message?: string;
      } | null;

      if (!signed.ok || !data?.ok || !data.url || !data.ref) {
        setUploadError(data?.message ?? "Could not start that upload.");
        return;
      }

      const put = await fetch(data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!put.ok) {
        // Most often a CORS or expiry problem, and the browser will not say
        // which, so point at the thing that is actually checkable.
        setUploadError(
          `S3 rejected the upload (${put.status}). Check the bucket CORS rules allow PUT from this origin.`,
        );
        return;
      }

      set("image", data.ref);
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

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

          <Field
            id="ev-hero-body"
            label="Hero paragraph"
            error={errors.heroBody}
            hint="Shown under the tagline in the hero, but only while this event is Featured. Leave it blank to use the standard line about the series. Deliberately not the summary above, which already appears in full further down the page."
            className="sm:col-span-2"
          >
            <TextArea
              id="ev-hero-body"
              name="heroBody"
              rows={3}
              value={values.heroBody}
              error={errors.heroBody}
              disabled={busy}
              onChange={(e) => set("heroBody", e.target.value)}
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
            hint="Small label on the image, e.g. Announcing Soon, Tickets Live, Sold Out. Say what state the event is in, not whether it is featured: Featured is the toggle below, and a badge that disagrees with it is the thing people notice."
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
            label="Photograph"
            optional
            error={errors.image ?? uploadError ?? undefined}
            hint={
              eventId
                ? "Upload a JPEG, PNG, WebP or AVIF. Uploading again replaces this event's photo everywhere."
                : "Save the event first, then you can upload a photograph."
            }
          >
            <div className="space-y-3">
              {eventId ? (
                <input
                  id="ev-image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={busy || uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset so selecting the same file twice still fires.
                    e.target.value = "";
                    if (file) void upload(file);
                  }}
                  className="border-ink/15 bg-bone-soft file:bg-ink file:text-bone hover:border-ink/30 w-full rounded-xl border px-4 py-3 text-[0.9375rem] file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-[0.8125rem] disabled:opacity-60"
                />
              ) : null}

              {uploading ? (
                <p className="text-ink/65 flex items-center gap-2 text-[0.8125rem]">
                  <Spinner />
                  Uploading…
                </p>
              ) : null}

              <TextInput
                id="ev-image"
                name="image"
                placeholder="s3:events/sun-club/hero.jpg or /media/sun-club-01.jpg"
                value={values.image}
                error={errors.image}
                disabled={busy || uploading}
                onChange={(e) => set("image", e.target.value)}
              />

              {values.image ? (
                <p className="text-ink/65 text-[0.75rem]">
                  {values.image.startsWith("s3:")
                    ? "Stored in the images bucket. Swap it by uploading again."
                    : "A file committed under /public."}
                </p>
              ) : null}
            </div>
          </Field>

          <div className="border-ink/12 bg-bone-soft space-y-5 rounded-2xl border p-5">
            <div>
              <h3 className="text-[1.0625rem] font-medium">
                Confirmation email for this event
              </h3>
              <p className="text-ink/65 mt-1.5 text-[0.8125rem] leading-relaxed">
                Sent to anyone who RSVPs while this is the featured event. Leave
                blank to use the standard wording. Write{" "}
                <code className="bg-ink/[0.06] rounded px-1">{"{name}"}</code> for
                their first name and{" "}
                <code className="bg-ink/[0.06] rounded px-1">{"{event}"}</code> for
                the event name.
              </p>
            </div>

            <Field
              id="ev-email-subject"
              label="Subject line"
              optional
              error={errors.emailSubject}
              hint="Default: You're confirmed for {event}"
            >
              <TextInput
                id="ev-email-subject"
                name="emailSubject"
                placeholder="You're confirmed for {event}"
                value={values.emailSubject}
                error={errors.emailSubject}
                disabled={busy}
                onChange={(e) => set("emailSubject", e.target.value)}
              />
            </Field>

            <Field
              id="ev-email-heading"
              label="Opening line"
              optional
              error={errors.emailHeading}
              hint="Default: Thanks {name}, your RSVP for {event} is confirmed."
            >
              <TextInput
                id="ev-email-heading"
                name="emailHeading"
                placeholder="Thanks {name}, your RSVP for {event} is confirmed."
                value={values.emailHeading}
                error={errors.emailHeading}
                disabled={busy}
                onChange={(e) => set("emailHeading", e.target.value)}
              />
            </Field>

            <Field
              id="ev-email-body"
              label="Message"
              optional
              error={errors.emailBody}
              hint="Leave a blank line between paragraphs. Plain text only, so it cannot break the layout."
            >
              <TextArea
                id="ev-email-body"
                name="emailBody"
                rows={5}
                placeholder="We'll email you as soon as the next date is set, before it goes public."
                value={values.emailBody}
                error={errors.emailBody}
                disabled={busy}
                onChange={(e) => set("emailBody", e.target.value)}
              />
            </Field>

            {eventId ? (
              <a
                href={`/api/admin/email-preview?type=guest&eventId=${encodeURIComponent(eventId)}`}
                target="_blank"
                rel="noreferrer"
                className="text-cobalt inline-block text-[0.875rem] underline-offset-4 hover:underline"
              >
                Preview this email in a new tab
              </a>
            ) : (
              <p className="text-ink/65 text-[0.8125rem]">
                Save the event to preview the email.
              </p>
            )}
          </div>

          <Field
            id="ev-genres"
            label="Genres"
            error={errors.genres}
            hint="Drives who gets promo email. Somebody who signs up from this event joins these audiences, so a bass night should not be tagged House."
          >
            <div className="border-ink/15 bg-bone-soft grid gap-2 rounded-xl border p-4 sm:grid-cols-2">
              {genreList.map((genre) => {
                const on = values.genres.includes(genre);
                return (
                  <label
                    key={genre}
                    htmlFor={`ev-genre-${genre}`}
                    className="flex cursor-pointer items-center gap-2.5 text-[0.875rem]"
                  >
                    <input
                      id={`ev-genre-${genre}`}
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={(e) =>
                        set(
                          "genres",
                          e.target.checked
                            ? [...values.genres, genre]
                            : values.genres.filter((g) => g !== genre),
                        )
                      }
                      className="accent-cobalt h-4 w-4 shrink-0"
                    />
                    {genre}
                  </label>
                );
              })}
            </div>
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
              label="Featured"
              hint="Drives the hero, the header RSVP button and /rsvp. Only one event can be featured, so turning this on turns it off everywhere else."
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
            <Toggle
              id="ev-rsvp-enabled"
              label="Accepting RSVPs"
              hint="Off removes the RSVP button and closes this event's signup page. Use it for an event worth showing before there is a date to sign up to."
              checked={values.rsvpEnabled}
              disabled={busy}
              onChange={(value) => set("rsvpEnabled", value)}
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

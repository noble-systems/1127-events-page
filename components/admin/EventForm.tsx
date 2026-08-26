"use client";

import { hero } from "@/content/site";
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
import { resolveImageSrc } from "@/lib/images";
import { shrinkImage } from "@/lib/shrink-image";
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
  /**
   * The event's URL slug, held apart from `values`: it is the record's id,
   * not a field on it. Editable only on an existing event; a new event's URL
   * is minted from its name. Sent as `newId` only when actually changed, so
   * an ordinary save can never trigger the rename path by accident.
   */
  const [slug, setSlug] = useState(eventId ?? "");
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
  const upload = async (
    raw: File,
    // The backdrop photograph and the hero wordmark share one flow; only the
    // stored field and the S3 key prefix differ.
    target: { field: "image" | "heroLogo"; kind: "hero" | "logo" } = {
      field: "image",
      kind: "hero",
    },
  ) => {
    setUploadError(null);
    setUploading(true);

    try {
      // Phone photos arrive at several megabytes; the site never serves more
      // than 2560px. Shrinking here makes every later cache and encode cheap.
      const file = await shrinkImage(raw, target.kind);
      const signed = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          kind: target.kind,
          filename: file.name,
          contentType: file.type,
        }),
      });

      const data = (await signed.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        ref?: string;
        cacheControl?: string;
        message?: string;
      } | null;

      if (!signed.ok || !data?.ok || !data.url || !data.ref) {
        setUploadError(data?.message ?? "Could not start that upload.");
        return;
      }

      const put = await fetch(data.url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          // Without this header the object lands with no caching policy at
          // all; verified against the real bucket. Freshness never depends on
          // it (the key is versioned per upload), it just lets every cache
          // hold the bytes for a year with a clear conscience.
          ...(data.cacheControl ? { "Cache-Control": data.cacheControl } : {}),
        },
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

      set(target.field, data.ref);
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  const setTier = (
    index: number,
    patch: Partial<EventFormValues["tickets"][number]>,
  ) => {
    set(
      "tickets",
      values.tickets.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
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
          body: JSON.stringify(
            eventId && slug.trim() && slug.trim() !== eventId
              ? { ...values, newId: slug.trim() }
              : values,
          ),
        },
      );

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        errors?: FormErrors;
        message?: string;
        notified?: number;
      } | null;

      if (!response.ok || !data?.ok) {
        if (data?.errors) setErrors(data.errors);
        setMessage(data?.message ?? "Couldn't save that. Please try again.");
        setBusy(false);
        return;
      }

      // A date or time change already emailed every ticket holder; say so,
      // because silently notifying people is how double-announcements happen.
      if (typeof data?.notified === "number" && data.notified > 0) {
        window.alert(
          `Schedule change: ${data.notified} ticket ${data.notified === 1 ? "holder was" : "holders were"} emailed the new date and time.`,
        );
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
              placeholder="The event's name"
              value={values.name}
              error={errors.name}
              disabled={busy}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          {eventId ? (
            <Field id="ev-slug" label="URL" error={errors.newId}>
              <TextInput
                id="ev-slug"
                name="newId"
                placeholder="the-event-name"
                value={slug}
                error={errors.newId}
                disabled={busy}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="text-ink/55 mt-2 text-[0.8125rem] leading-relaxed">
                1127.events/rsvp/{slug.trim() || eventId}
                {slug.trim() && slug.trim() !== eventId
                  ? ". The old address will keep redirecting here, so links already out there survive the change."
                  : ""}
              </p>
            </Field>
          ) : null}

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
            hint="Shown under the tagline in the hero, while this event is Featured. Deliberately not the summary above, which already appears in full further down the page. Leave it blank and the greyed-out line below shows instead, which is about the series rather than this night."
            className="sm:col-span-2"
          >
            <TextArea
              id="ev-hero-body"
              name="heroBody"
              rows={3}
              // The real fallback, so an empty box shows exactly what the
              // homepage will say rather than a description of it. Saying "the
              // standard line about the series" told an admin there was a
              // default without telling them what it was, so a new event got a
              // paragraph about Sun Club and nobody knew where it came from.
              placeholder={hero.body}
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
            id="ev-time"
            label="Time"
            optional
            error={errors.time}
            hint='Door-to-close hours, e.g. "12-4 PM". Shows next to the date on the event, the tickets page and the ticket email; blank hides it.'
          >
            <TextInput
              id="ev-time"
              name="time"
              value={values.time}
              error={errors.time}
              disabled={busy}
              onChange={(e) => set("time", e.target.value)}
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
                placeholder="s3:events/<event>/hero.jpg or /media/photo-01.jpg"
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

          <Field
            id="ev-hero-logo"
            label="Hero logo"
            optional
            error={errors.heroLogo ?? undefined}
            hint={
              eventId
                ? "A wordmark shown in the hero instead of the typed name while this event is featured. Light artwork on a transparent PNG reads best on the dark backdrop. The name stays in the page for screen readers and search."
                : "Save the event first, then you can upload a logo."
            }
          >
            <div className="space-y-3">
              {eventId ? (
                <input
                  id="ev-hero-logo-file"
                  type="file"
                  accept="image/png,image/webp,image/avif,image/jpeg"
                  disabled={busy || uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void upload(file, { field: "heroLogo", kind: "logo" });
                  }}
                  className="border-ink/15 bg-bone-soft file:bg-ink file:text-bone hover:border-ink/30 w-full rounded-xl border px-4 py-3 text-[0.9375rem] file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-[0.8125rem] disabled:opacity-60"
                />
              ) : null}

              {values.heroLogo ? (
                <div className="flex items-center gap-3">
                  {/* Dark backdrop, because that is where the logo will live. */}
                  <span className="bg-deep inline-block rounded-xl p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImageSrc(values.heroLogo) ?? undefined}
                      alt=""
                      className="h-14 w-auto max-w-[16rem] object-contain"
                    />
                  </span>
                  <button
                    type="button"
                    disabled={busy || uploading}
                    onClick={() => set("heroLogo", "")}
                    className="text-terracotta-deep text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    Remove, and show the name as text
                  </button>
                </div>
              ) : null}

              {values.heroLogo ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-xs text-ink/65">Size in the hero</span>
                  {(["sm", "md", "lg"] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      disabled={busy || uploading}
                      aria-pressed={values.heroLogoSize === size}
                      onClick={() => set("heroLogoSize", size)}
                      className={`rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 disabled:opacity-50 ${
                        values.heroLogoSize === size
                          ? "border-ink bg-ink text-bone"
                          : "border-ink/20 hover:border-ink/45"
                      }`}
                    >
                      {{ sm: "Small", md: "Medium", lg: "Large" }[size]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>

          <div className="border-ink/12 bg-bone-soft space-y-5 rounded-2xl border p-5">
            <div>
              <h3 className="text-[1.0625rem] font-medium">
                List signup confirmation email
              </h3>
              <p className="text-ink/65 mt-1.5 text-[0.8125rem] leading-relaxed">
                Sent to anyone who joins the free list from this event&apos;s
                page. Ticket buyers are separate: they automatically get a
                receipt with their door codes. Leave blank for the standard
                wording. Write{" "}
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
              hint="Default: Thanks {name}, your spot on the {event} list is confirmed."
            >
              <TextInput
                id="ev-email-heading"
                name="emailHeading"
                placeholder="Thanks {name}, your spot on the {event} list is confirmed."
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

          <Field
            id="ev-cta-action"
            label="Button goes to"
            error={errors.ctaAction}
            hint="While tickets are on sale the card shows Get tickets regardless; this decides the button when they are not. rsvp is the free list signup."
          >
            <Select
              id="ev-cta-action"
              name="ctaAction"
              options={["tickets", "rsvp", "partner"]}
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
              id="ev-published"
              label="Published"
              hint="Off keeps it as a draft, hidden from the public site. Unpublishing the featured event hands the hero to the next one in order."
              checked={values.published}
              disabled={busy}
              onChange={(value) => set("published", value)}
            />
            <Toggle
              id="ev-rsvp-enabled"
              label="Free list signups"
              hint="The no-ticket mailing list signup at /rsvp. Off removes its button and closes this event's signup page. Ticket selling has its own switch in the Tickets section below."
              checked={values.rsvpEnabled}
              disabled={busy}
              onChange={(value) => set("rsvpEnabled", value)}
            />
          </div>
        </div>
      </section>

      <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
        <h2 className="font-display text-xl">Tickets</h2>
        <p className="text-ink/65 mt-2 max-w-2xl text-[0.8125rem] leading-relaxed">
          Paid entry, charged through Square. Each type has its own price and
          its own pool; the pool can never oversell. Selling needs the switch
          on and at least one type below.
        </p>

        <div className="mt-6 space-y-5">
          <Toggle
            id="ev-tickets-enabled"
            label="Selling tickets"
            hint="Off keeps the tickets page up but says sales haven't opened, so a shared link never dies."
            checked={values.ticketsEnabled}
            disabled={busy}
            onChange={(value) => set("ticketsEnabled", value)}
          />

          {values.tickets.map((tier, index) => (
            <div
              key={tier.id || `new-${index}`}
              className="border-ink/12 bg-bone-soft grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_130px_130px_auto] sm:items-start"
            >
              <Field
                id={`ev-ticket-${index}-name`}
                label="Type"
                error={errors[`ticket-${index}-name`]}
              >
                <TextInput
                  id={`ev-ticket-${index}-name`}
                  name={`ticket-${index}-name`}
                  placeholder="Early Bird"
                  value={tier.name}
                  error={errors[`ticket-${index}-name`]}
                  disabled={busy}
                  onChange={(e) => setTier(index, { name: e.target.value })}
                />
              </Field>
              <Field
                id={`ev-ticket-${index}-price`}
                label="Price"
                error={errors[`ticket-${index}-price`]}
              >
                <TextInput
                  id={`ev-ticket-${index}-price`}
                  name={`ticket-${index}-price`}
                  placeholder="$15"
                  value={tier.price}
                  error={errors[`ticket-${index}-price`]}
                  disabled={busy}
                  onChange={(e) => setTier(index, { price: e.target.value })}
                />
              </Field>
              <Field
                id={`ev-ticket-${index}-capacity`}
                label="How many"
                error={errors[`ticket-${index}-capacity`]}
              >
                <TextInput
                  id={`ev-ticket-${index}-capacity`}
                  name={`ticket-${index}-capacity`}
                  type="number"
                  min={1}
                  placeholder="25"
                  value={tier.capacity}
                  error={errors[`ticket-${index}-capacity`]}
                  disabled={busy}
                  onChange={(e) => setTier(index, { capacity: e.target.value })}
                />
              </Field>
              <div className="mt-1 flex gap-4 justify-self-start sm:mt-8">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setTier(index, { soldOut: !tier.soldOut })}
                  className={`text-[0.8125rem] underline underline-offset-2 ${
                    tier.soldOut
                      ? "text-terracotta-deep hover:text-ink font-medium"
                      : "text-ink/55 hover:text-ink"
                  }`}
                >
                  {tier.soldOut ? "Sold out. Reopen" : "Mark sold out"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setTier(index, { hidden: !tier.hidden })}
                  className={`text-[0.8125rem] underline underline-offset-2 ${
                    tier.hidden
                      ? "text-sun-deep hover:text-ink font-medium"
                      : "text-ink/55 hover:text-ink"
                  }`}
                >
                  {tier.hidden ? "Hidden. Show" : "Hide"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    set(
                      "tickets",
                      values.tickets.filter((_, i) => i !== index),
                    )
                  }
                  className="text-ink/55 hover:text-ink text-[0.8125rem] underline underline-offset-2"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {errors.tickets ? (
            <p role="alert" className="text-terracotta-deep text-[0.875rem]">
              {errors.tickets}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={busy || values.tickets.length >= 12}
              onClick={() =>
                set("tickets", [
                  ...values.tickets,
                  {
                    id: "",
                    name: "",
                    price: "",
                    capacity: "",
                    hidden: false,
                    soldOut: false,
                  },
                ])
              }
            >
              Add a ticket type
            </Button>
            {values.tickets.length > 0 ? (
              <p className="text-ink/55 text-[0.8125rem]">
                Mark sold out keeps the type visible but greyed and closed;
                Hide takes it off the page entirely; Remove drops it. Every
                one of them keeps tickets already sold.
              </p>
            ) : null}
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

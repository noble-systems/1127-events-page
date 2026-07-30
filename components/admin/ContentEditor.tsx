"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Field,
  FormAlert,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/forms/Fields";
import { Button } from "@/components/ui/Button";
import {
  CONTENT_GROUPS,
  type ContentField,
  type ContentGroup,
} from "@/lib/content-schema";
import { resolveImageSrc } from "@/lib/images";

/**
 * Edits the homepage.
 *
 * Rendered entirely from lib/content-schema.ts, so adding a newly editable
 * field is one entry in that file and nothing here.
 *
 * Every input shows the committed default as its placeholder. That is what
 * makes "clear the box to go back to the standard wording" discoverable, and it
 * means somebody editing can always see what they are replacing.
 */

type Values = Record<string, string>;

function toFormValue(field: ContentField, stored: unknown): string {
  if (stored === undefined || stored === null) return "";
  if (field.kind === "list") {
    return Array.isArray(stored) ? stored.join("\n") : String(stored);
  }
  return String(stored);
}

function defaultAsText(field: ContentField, fallback: unknown): string {
  if (fallback === undefined || fallback === null) return "";
  if (Array.isArray(fallback)) return fallback.join("\n");
  return String(fallback);
}

function ImagePreview({ value }: { value: string }) {
  const src = resolveImageSrc(value);

  if (!src) {
    return (
      <div className="border-ink/15 bg-ink/[0.03] text-ink/65 flex h-32 items-center justify-center rounded-xl border border-dashed text-[0.8125rem]">
        No photograph. The designed gradient shows instead.
      </div>
    );
  }

  return (
    // Deliberately a plain img, not next/image: this is a preview of a file that
    // may have been uploaded seconds ago, and the optimiser would serve a cached
    // older version and make a successful swap look like it failed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="border-ink/15 h-32 w-full rounded-xl border object-cover"
    />
  );
}

function FieldRow({
  field,
  value,
  fallback,
  busy,
  uploading,
  error,
  onChange,
  onUpload,
}: {
  field: ContentField;
  value: string;
  fallback: unknown;
  busy: boolean;
  uploading: boolean;
  error?: string;
  onChange: (value: string) => void;
  onUpload: (file: File) => void;
}) {
  const id = `content-${field.key.replace(/\./g, "-")}`;
  const placeholder = defaultAsText(field, fallback);
  const isOverridden = value.trim() !== "";

  if (field.kind === "image") {
    return (
      <Field
        id={id}
        label={field.label}
        error={error}
        hint={
          field.hint ??
          "JPEG, PNG, WebP or AVIF. Replaces the photo everywhere it appears."
        }
      >
        <div className="space-y-3">
          <ImagePreview value={value || String(fallback ?? "")} />

          <input
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }}
            className="border-ink/15 bg-bone-soft file:bg-ink file:text-bone hover:border-ink/30 w-full rounded-xl border px-4 py-3 text-[0.875rem] file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-[0.8125rem] disabled:opacity-60"
          />

          {uploading ? (
            <p className="text-ink/65 flex items-center gap-2 text-[0.8125rem]">
              <Spinner />
              Uploading…
            </p>
          ) : null}

          {isOverridden ? (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={busy || uploading}
              className="text-terracotta-deep text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
            >
              Remove this photograph
            </button>
          ) : null}
        </div>
      </Field>
    );
  }

  const Input =
    field.kind === "textarea" || field.kind === "list" ? TextArea : TextInput;

  return (
    <Field
      id={id}
      label={field.label}
      error={error}
      hint={
        field.hint ??
        (isOverridden
          ? "Clear this to go back to the standard wording."
          : undefined)
      }
    >
      <Input
        id={id}
        name={field.key}
        rows={field.kind === "list" ? 5 : 3}
        placeholder={placeholder}
        value={value}
        disabled={busy}
        onChange={(event: { target: { value: string } }) =>
          onChange(event.target.value)
        }
      />
    </Field>
  );
}

export function ContentEditor({
  initialOverrides,
  defaults,
}: {
  initialOverrides: Record<string, unknown>;
  /** Committed values, shown as placeholders. */
  defaults: Record<string, unknown>;
}) {
  const router = useRouter();

  const [values, setValues] = useState<Values>(() => {
    const next: Values = {};
    for (const group of CONTENT_GROUPS) {
      for (const field of group.fields) {
        next[field.key] = toFormValue(field, initialOverrides[field.key]);
      }
    }
    return next;
  });

  const [open, setOpen] = useState<string>(CONTENT_GROUPS[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const changed = useMemo(() => {
    let n = 0;
    for (const group of CONTENT_GROUPS) {
      for (const field of group.fields) {
        const before = toFormValue(field, initialOverrides[field.key]);
        if ((values[field.key] ?? "") !== before) n += 1;
      }
    }
    return n;
  }, [values, initialOverrides]);

  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const upload = async (field: ContentField, file: File) => {
    setUploading(field.key);
    setError(null);
    try {
      const signed = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentKey: field.key,
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
        setError(data?.message ?? "Could not start that upload.");
        return;
      }

      const put = await fetch(data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError(
          `S3 rejected the upload (${put.status}). Check the bucket CORS rules allow PUT from this origin.`,
        );
        return;
      }

      // Cache-buster on the stored ref would pollute the value, so instead the
      // preview relies on the short max-age set at upload time.
      set(field.key, data.ref);
      setMessage("Photograph uploaded. Save to publish it.");
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        errors?: Record<string, string>;
      } | null;

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "Couldn't save. Please try again.");
        if (data?.errors) setFieldErrors(data.errors);
        return;
      }

      setMessage("Saved. The homepage updates within about a minute.");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <FormAlert message={error} /> : null}

      {message ? (
        <p
          role="status"
          className="border-cobalt/25 bg-cobalt/[0.06] text-ink/80 rounded-xl border px-4 py-3 text-[0.875rem]"
        >
          {message}
        </p>
      ) : null}

      {CONTENT_GROUPS.map((group: ContentGroup) => {
        const isOpen = open === group.id;
        const overridden = group.fields.filter(
          (f) => (values[f.key] ?? "").trim() !== "",
        ).length;

        return (
          <section
            key={group.id}
            className="border-ink/12 bg-bone overflow-hidden rounded-2xl border"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? "" : group.id)}
              aria-expanded={isOpen}
              className="hover:bg-ink/[0.02] flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
            >
              <span>
                <span className="block text-[1.0625rem] font-medium">
                  {group.title}
                </span>
                <span className="text-ink/65 mt-1 block text-[0.8125rem] leading-relaxed">
                  {group.description}
                </span>
              </span>
              <span className="text-ink/65 shrink-0 text-[0.8125rem] whitespace-nowrap">
                {overridden > 0 ? `${overridden} edited` : "default"}
                <span aria-hidden="true" className="ml-3">
                  {isOpen ? "−" : "+"}
                </span>
              </span>
            </button>

            {isOpen ? (
              <div className="border-ink/12 space-y-5 border-t px-5 py-5">
                {group.fields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    value={values[field.key] ?? ""}
                    fallback={defaults[field.key]}
                    busy={busy}
                    uploading={uploading === field.key}
                    error={fieldErrors[field.key]}
                    onChange={(v) => set(field.key, v)}
                    onUpload={(file) => void upload(field, file)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      <div className="border-ink/12 bg-bone sticky bottom-0 flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4">
        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={busy || changed === 0}
          onClick={() => void save()}
        >
          {busy ? <Spinner /> : null}
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <p className="text-ink/65 text-[0.8125rem]">
          {changed === 0
            ? "No unsaved changes."
            : `${changed} unsaved change${changed === 1 ? "" : "s"}.`}
        </p>
      </div>
    </div>
  );
}

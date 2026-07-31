"use client";

import {
  Field,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/forms/Fields";
import {
  CONTENT_GROUPS,
  type ContentField,
} from "@/lib/content-schema";
import { resolveImageSrc } from "@/lib/images";

/**
 * One field row, shared by both content editors.
 *
 * The form-based editor at /admin/content and the live editor at /admin/preview
 * render the same fields from the same schema. Duplicating this would let the
 * two drift, and a field that behaves differently depending on which screen you
 * opened is the kind of difference nobody notices until it has already saved
 * the wrong thing.
 */

export type Values = Record<string, string>;

export const FIELD_BY_KEY = new Map(
  CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f] as const)),
);

export function toFormValue(field: ContentField, stored: unknown): string {
  if (stored === undefined || stored === null) return "";
  if (field.kind === "pairs") {
    const [left, right] = field.pairKeys ?? ["label", "value"];
    return Array.isArray(stored)
      ? stored
          .map((row) =>
            row && typeof row === "object"
              ? `${(row as Record<string, string>)[left] ?? ""}: ${(row as Record<string, string>)[right] ?? ""}`
              : String(row),
          )
          .join("\n")
      : String(stored);
  }
  if (field.kind === "list") {
    return Array.isArray(stored) ? stored.join("\n") : String(stored);
  }
  return String(stored);
}

export function defaultAsText(field: ContentField, fallback: unknown): string {
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

export function FieldRow({
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

          {value.trim() !== String(fallback ?? "").trim() ? (
            <button
              type="button"
              onClick={() => onChange(String(fallback ?? ""))}
              disabled={busy || uploading}
              className="text-terracotta-deep text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
            >
              Undo this change
            </button>
          ) : null}
        </div>
      </Field>
    );
  }

  const Input =
    field.kind === "textarea" || field.kind === "list" || field.kind === "pairs"
      ? TextArea
      : TextInput;
  const differsFromDefault = value.trim() !== placeholder.trim();

  return (
    <Field id={id} label={field.label} error={error} hint={field.hint}>
      <div className="space-y-2">
        <Input
          id={id}
          name={field.key}
          rows={field.kind === "list" || field.kind === "pairs" ? 5 : 3}
          placeholder={placeholder}
          value={value}
          disabled={busy}
          onChange={(event: { target: { value: string } }) =>
            onChange(event.target.value)
          }
        />
        {differsFromDefault ? (
          <button
            type="button"
            onClick={() => onChange(placeholder)}
            disabled={busy}
            className="text-ink/65 hover:text-ink text-[0.75rem] underline-offset-4 hover:underline disabled:opacity-50"
          >
            Reset to the standard wording
          </button>
        ) : null}
      </div>
    </Field>
  );
}

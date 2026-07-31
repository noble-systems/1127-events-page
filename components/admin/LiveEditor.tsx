"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HomeSections } from "@/components/HomeSections";
import { EditProvider, type EditApi } from "@/components/edit/EditContext";
import {
  FIELD_BY_KEY,
  defaultAsText,
  toFormValue,
  type Values,
} from "@/components/admin/ContentField";
import { CONTENT_GROUPS } from "@/lib/content-schema";
import {
  defaultContent,
  mergeContent,
  normaliseValue,
  readPath,
  type ContentOverrides,
  type SiteContent,
} from "@/lib/site-content";
import type { EventRecord } from "@/lib/types";

/**
 * The homepage, edited on the homepage.
 *
 * There is no field panel. You click the sentence you want to change and type
 * over it, and you click a photograph to replace it, because a list of forty
 * boxes beside a preview is still a form: you read a label, guess which part of
 * the page it controls, and check afterwards. The page is the label.
 *
 * This is the real page, not a copy. HomeSections is the same tree the public
 * route mounts, handed a draft instead of the stored content, and the Editable
 * wrappers inside the sections render nothing at all when no edit context is
 * present. So a visitor gets exactly the markup they got before this existed.
 *
 * Every section is pure and synchronous, which is what lets a keystroke
 * re-render the page without a round trip.
 *
 * The form at /admin/content still exists and edits the same fields. It is the
 * better tool on a phone, and for anything with no obvious place to click.
 */

/**
 * Field values to the content the page reads.
 *
 * The same shape the save endpoint receives, run through the same merge, so
 * this is not an approximation of what saving would do: it is what saving does.
 * An empty box is left out entirely, which is how a cleared field falls back to
 * the committed default here exactly as it will on the live page.
 */
function draftFrom(values: Values): SiteContent {
  const overrides: ContentOverrides = {};

  for (const [key, raw] of Object.entries(values)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;

    // normaliseValue is what the save endpoint applies. Re-implementing the
    // trimming and splitting here would let the preview and the saved page
    // disagree in exactly the cases nobody checks, such as a list whose lines
    // are all blank. null means "no override", so the default shows through.
    const value = normaliseValue(field.kind, raw);
    if (value === null) continue;

    overrides[key] = value;
  }

  return mergeContent(overrides);
}

export function LiveEditor({
  stored,
  events,
}: {
  /** What the page says right now: defaults plus any saved overrides. */
  stored: SiteContent;
  events: EventRecord[];
}) {
  const router = useRouter();

  // Pure, so the placeholders showing "what this falls back to" are computed
  // here rather than shipped as a second copy of the same object.
  const defaults = useMemo(() => defaultContent(), []);

  const initial = useMemo(() => {
    const values: Values = {};
    for (const group of CONTENT_GROUPS) {
      for (const field of group.fields) {
        values[field.key] = toFormValue(field, readPath(stored, field.key));
      }
    }
    return values;
  }, [stored]);

  const [values, setValues] = useState<Values>(initial);
  // Which field has the caret, so only one shows as focused at a time.
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(
    () => CONTENT_GROUPS.some((g) => g.fields.some((f) => values[f.key] !== initial[f.key])),
    [values, initial],
  );

  const draft = useMemo(() => draftFrom(values), [values]);

  /**
   * The browser's own guard. A custom banner cannot stop a tab being closed, so
   * the only thing that actually prevents losing an edit is this.
   */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = useCallback((key: string, value: string) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Two steps: presign, then send the bytes straight to S3. */
  const upload = useCallback(async (key: string, file: File) => {
    setError(null);
    setUploading(key);
    try {
      const signed = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
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
        setError(`S3 rejected the upload (${put.status}).`);
        return;
      }

      set(key, data.ref);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(null);
    }
  }, [set]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // The flat map the endpoint reads, and the same rule the form editor
        // uses: a box left exactly matching the committed default is sent as
        // empty, which the API stores as no override at all. That keeps the
        // store to genuine edits, so a later copy change in the repo still
        // reaches the live page.
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(values).map(([key, value]) => {
              const field = FIELD_BY_KEY.get(key);
              const asDefault = field
                ? defaultAsText(field, readPath(defaults, key))
                : undefined;
              return [key, value === asDefault ? "" : value];
            }),
          ),
        ),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "Could not save those changes.");
        return;
      }

      setSaved(true);
      // Re-reads the server components so `initial` matches what is stored and
      // the page stops counting as dirty.
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const leave = (event: React.MouseEvent) => {
    if (!dirty) return;
    if (!window.confirm("You have unsaved changes. Leave without saving?")) {
      event.preventDefault();
    }
  };
  const api = useMemo<EditApi>(
    () => ({
      value: (path) => values[path],
      set,
      upload,
      uploading,
      active,
      setActive,
    }),
    [values, set, upload, uploading, active],
  );

  return (
    <EditProvider value={api}>
      <div className="min-h-screen">
        {/* -------------------------------------------------------------- */}
        {/* Banner                                                          */}
        {/* -------------------------------------------------------------- */}
        <div className="bg-ink text-bone sticky top-0 z-[100] shadow-[0_1px_0_rgba(247,242,233,0.12)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
            <span className="label-xs bg-sun/25 text-bone rounded-full px-2.5 py-1">
              Edit mode
            </span>

            <p className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed">
              {dirty ? (
                <>
                  <strong className="font-medium">Unsaved changes.</strong> Save
                  before you leave this page or they are lost.
                </>
              ) : saved ? (
                "Saved. The live site is updated."
              ) : (
                "Click any text or photograph to change it. Nothing is public until you save."
              )}
            </p>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setValues(initial)}
                disabled={!dirty || saving}
                className="border-bone/25 hover:border-bone/50 rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Discard
              </button>

              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="bg-bone text-ink rounded-full px-4 py-1.5 text-[0.8125rem] font-medium transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>

              <Link
                href="/admin/content"
                onClick={leave}
                className="text-bone/70 hover:text-bone px-2 text-[0.8125rem] underline-offset-4 hover:underline"
              >
                Exit
              </Link>
            </div>
          </div>

          {error ? (
            <p className="bg-clay/90 text-bone px-4 py-2 text-[0.8125rem] sm:px-6">
              {error}
            </p>
          ) : null}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* The page, edited in place                                       */}
        {/* -------------------------------------------------------------- */}
        {/* Links and buttons are inert so a stray click cannot navigate away
            and take an unsaved edit with it. The editing affordances add their
            own pointer-events back. */}
        <div className="[&_a]:pointer-events-none [&_button]:pointer-events-none [&_[data-edit-path]]:pointer-events-auto [&_[data-edit-control]]:pointer-events-auto [&_[data-edit-control]_*]:pointer-events-auto">
          <HomeSections content={draft} events={events} />
        </div>
      </div>
    </EditProvider>
  );
}

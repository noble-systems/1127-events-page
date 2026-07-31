"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HomeSections } from "@/components/HomeSections";
import {
  FIELD_BY_KEY,
  FieldRow,
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
 * The homepage, editable in place.
 *
 * The preview is the real page: HomeSections is the same tree the public route
 * mounts, handed a draft instead of the stored content. Rebuilding an
 * approximation of the page here would drift the moment a section changed, and
 * the drift would be invisible until something shipped looking wrong.
 *
 * Every section component is pure and synchronous, which is what lets a
 * keystroke re-render the page without a round trip.
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [openGroup, setOpenGroup] = useState<string>(CONTENT_GROUPS[0]?.id ?? "");
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

  return (
    <div className="min-h-screen">
      {/* ---------------------------------------------------------------- */}
      {/* Banner                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-ink text-bone sticky top-0 z-[100] shadow-[0_1px_0_rgba(247,242,233,0.12)]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
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
              "You are editing the live homepage. Nothing is public until you save."
            )}
          </p>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPanelOpen((open) => !open)}
              className="border-bone/25 hover:border-bone/50 rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200"
            >
              {panelOpen ? "Hide fields" : "Show fields"}
            </button>

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

      <div className="flex">
        {/* -------------------------------------------------------------- */}
        {/* Fields                                                          */}
        {/* -------------------------------------------------------------- */}
        {panelOpen ? (
          <aside className="border-ink/12 bg-bone sticky top-[3.25rem] hidden h-[calc(100vh-3.25rem)] w-[380px] shrink-0 overflow-y-auto border-r lg:block">
            <div className="p-5">
              <h2 className="font-display text-xl">Page content</h2>
              <p className="text-ink/65 mt-2 text-[0.8125rem] leading-relaxed">
                The page beside this updates as you type. Clearing a box restores
                the wording the site ships with.
              </p>

              <div className="mt-5 space-y-2">
                {CONTENT_GROUPS.map((group) => {
                  const isOpen = openGroup === group.id;
                  const changed = group.fields.filter(
                    (f) => values[f.key] !== initial[f.key],
                  ).length;

                  return (
                    <div
                      key={group.id}
                      className="border-ink/12 overflow-hidden rounded-xl border"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenGroup(isOpen ? "" : group.id)}
                        aria-expanded={isOpen}
                        className="hover:bg-bone-soft flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200"
                      >
                        <span className="text-[0.9375rem] font-medium">
                          {group.title}
                          {changed > 0 ? (
                            <span className="bg-sun/30 ml-2 rounded-full px-2 py-0.5 text-[0.6875rem]">
                              {changed}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-ink/50 text-[0.8125rem]">
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-ink/10 space-y-4 border-t px-4 py-4">
                          {group.description ? (
                            <p className="text-ink/65 text-[0.8125rem] leading-relaxed">
                              {group.description}
                            </p>
                          ) : null}

                          {group.fields.map((field) => (
                            <FieldRow
                              key={field.key}
                              field={field}
                              value={values[field.key] ?? ""}
                              fallback={readPath(defaults, field.key)}
                              busy={saving}
                              uploading={uploading === field.key}
                              onChange={(value) => set(field.key, value)}
                              onUpload={(file) => upload(field.key, file)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <p className="text-ink/65 mt-6 text-[0.8125rem] leading-relaxed">
                The hero and series intro follow whichever event is Featured, so
                their name, date and photograph are edited under{" "}
                <Link
                  href="/admin/events"
                  onClick={leave}
                  className="text-cobalt underline-offset-4 hover:underline"
                >
                  Events
                </Link>
                .
              </p>
            </div>
          </aside>
        ) : null}

        {/* -------------------------------------------------------------- */}
        {/* The page itself                                                 */}
        {/* -------------------------------------------------------------- */}
        <div className="min-w-0 flex-1">
          {/* Pointer events are off so a click inside the preview cannot
              navigate away and lose the edit. Scrolling still works. */}
          <div className="[&_a]:pointer-events-none [&_button]:pointer-events-none">
            <HomeSections content={draft} events={events} />
          </div>
        </div>
      </div>

      <div className="border-ink/12 bg-bone border-t px-4 py-4 text-center lg:hidden">
        <p className="text-ink/65 text-[0.875rem] leading-relaxed">
          The field panel needs a wider screen. On a phone, edit from{" "}
          <Link href="/admin/content" onClick={leave} className="text-cobalt underline">
            Page content
          </Link>
          .
        </p>
      </div>

      <noscript>
        <p className="bg-clay text-bone px-4 py-3">
          Live editing needs JavaScript. Use Page content instead.
        </p>
      </noscript>
    </div>
  );
}

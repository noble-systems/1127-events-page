"use client";

import { useRef, useState } from "react";
import { useEdit } from "./EditContext";

/**
 * A photograph you can click to replace.
 *
 * Outside edit mode this is `<>{children}</>`, so the public page gets the
 * image and nothing wrapped around it.
 *
 * Alt text lives here too. It is the one editable thing with nowhere on the
 * page to click, because a correct alt attribute is invisible by definition.
 * Attaching it to the photo it describes is the only place it makes sense: you
 * are already looking at the picture you have to describe.
 */
export function EditableImage({
  path,
  altPath,
  className = "",
  children,
}: {
  /** Content key for the image, e.g. "mediaSlots.0.image". */
  path: string;
  /** Content key for its alt text. */
  altPath?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const edit = useEdit();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  if (!edit) return <>{children}</>;

  const busy = edit.uploading === path;
  const alt = altPath ? (edit.value(altPath) ?? "") : "";

  return (
    <div className={`group/edit relative ${className}`}>
      {children}

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void edit.upload(path, file);
          // Clearing it means picking the same file twice still fires a change.
          event.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        data-edit-control=""
        onClick={() => setOpen((value) => !value)}
        className="ring-cobalt/0 hover:ring-cobalt absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-2xl ring-2 transition-all duration-200 hover:bg-[rgba(7,20,47,0.45)]"
      >
        <span className="bg-bone text-ink rounded-full px-4 py-2 text-[0.8125rem] font-medium opacity-0 transition-opacity duration-200 group-hover/edit:opacity-100">
          {busy ? "Uploading…" : "Change photo"}
        </span>
      </button>

      {open ? (
        <div
          data-edit-control=""
          className="border-ink/15 bg-bone absolute top-3 left-3 z-20 w-[min(20rem,calc(100%-1.5rem))] rounded-xl border p-4 shadow-[0_20px_50px_-20px_rgba(7,20,47,0.5)]"
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="bg-ink text-bone w-full rounded-full px-4 py-2 text-[0.875rem] transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload a photo"}
          </button>

          {altPath ? (
            <label className="mt-4 block">
              <span className="label-xs text-ink/65">Alt text</span>
              <input
                type="text"
                value={alt}
                onChange={(event) => edit.set(altPath, event.target.value)}
                placeholder="Describe the photograph"
                className="border-ink/15 bg-bone-soft focus:border-ink/40 mt-1.5 w-full rounded-lg border px-3 py-2 text-[0.875rem] outline-none"
              />
              <span className="text-ink/65 mt-1.5 block text-[0.75rem] leading-relaxed">
                Read aloud to anyone using a screen reader, and shown if the
                photo fails to load. Describe what is happening, not that it is
                a photo.
              </span>
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-ink/65 hover:text-ink mt-3 text-[0.8125rem] underline-offset-4 hover:underline"
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}

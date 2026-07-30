"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert, Spinner, TextInput } from "@/components/forms/Fields";
import { Button } from "@/components/ui/Button";

/**
 * Add, rename and delete genres.
 *
 * Rename and delete rewrite every event and every person carrying the value, so
 * both confirm first and report how many records moved. Doing it silently would
 * be the worst version of this: a rename that missed the records looks like it
 * worked and quietly empties a segment.
 */
export function GenreManager({ genres }: { genres: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");

  const send = async (body: Record<string, string>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        migrated?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "That didn't work. Please try again.");
        return false;
      }

      setNotice(
        data.migrated && data.migrated !== "nothing else"
          ? `${done} Updated ${data.migrated}.`
          : done,
      );
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    if (await send({ kind: "add", name }, `Added "${name}".`)) setAdding("");
  };

  const rename = async (from: string) => {
    const to = renameTo.trim();
    if (!to || to === from) {
      setRenaming(null);
      return;
    }
    if (
      !window.confirm(
        `Rename "${from}" to "${to}"?\n\nEvery event and every person tagged "${from}" will be updated to match. Without that they would keep a genre that no longer exists and stop appearing in any segment.`,
      )
    ) {
      return;
    }
    if (await send({ kind: "rename", from, to }, `Renamed to "${to}".`)) {
      setRenaming(null);
      setRenameTo("");
    }
  };

  const remove = async (name: string) => {
    if (
      !window.confirm(
        `Delete "${name}"?\n\nIt will be removed from every event and from every person carrying it. Anyone whose only genre was "${name}" will no longer appear in any genre segment.\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    await send({ kind: "delete", name }, `Deleted "${name}".`);
  };

  return (
    <section className="border-ink/12 bg-bone rounded-2xl border p-5">
      <h2 className="font-display text-xl">Genres</h2>
      <p className="text-ink/65 mt-2 text-[0.875rem] leading-relaxed">
        Tag events with these, and anyone who signs up from an event inherits them.
        Renaming or deleting one updates every event and person already carrying it.
      </p>

      {error ? (
        <div className="mt-4">
          <FormAlert message={error} />
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="border-cobalt/25 bg-cobalt/[0.06] text-ink/80 mt-4 rounded-xl border px-4 py-3 text-[0.875rem]"
        >
          {notice}
        </p>
      ) : null}

      <ul className="mt-5 space-y-2">
        {genres.map((genre) => (
          <li
            key={genre}
            className="border-ink/12 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5"
          >
            {renaming === genre ? (
              <>
                <TextInput
                  id={`rename-${genre}`}
                  value={renameTo}
                  disabled={busy}
                  autoFocus
                  onChange={(e) => setRenameTo(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void rename(genre)}
                  disabled={busy}
                  className="text-cobalt text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  disabled={busy}
                  className="text-ink/65 hover:text-ink text-[0.8125rem] underline-offset-4 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[0.9375rem]">{genre}</span>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(genre);
                    setRenameTo(genre);
                  }}
                  disabled={busy}
                  className="text-ink/65 hover:text-ink text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void remove(genre)}
                  disabled={busy}
                  className="text-terracotta-deep text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="add-genre" className="label-xs text-ink/70 mb-2 block">
            Add a genre
          </label>
          <TextInput
            id="add-genre"
            placeholder="Afro House"
            value={adding}
            disabled={busy}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="md"
          disabled={busy || !adding.trim()}
          onClick={() => void add()}
        >
          {busy ? <Spinner /> : null}
          Add
        </Button>
      </div>
    </section>
  );
}

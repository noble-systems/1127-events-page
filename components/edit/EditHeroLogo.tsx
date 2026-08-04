"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EventRecord } from "@/lib/types";
import { useEdit } from "./EditContext";

/**
 * Size and spacing for the hero wordmark, adjusted while looking at it.
 *
 * These are event fields, not page content, but the live editor is where they
 * belong: spacing is a judgement about how the hero looks, and the event form
 * cannot show you that. The panel renders only in edit mode, under the logo it
 * controls, and writes through the same validated event PUT the admin list's
 * toggles use, so every other field survives the round trip.
 *
 * Each change saves immediately and refreshes the server render, which is the
 * toggle pattern everywhere else in the dashboard: no separate save button to
 * forget, and what you see after the refresh is what visitors get.
 */
export function EditHeroLogo({ event }: { event: EventRecord }) {
  const edit = useEdit();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!edit) return null;

  const save = async (patch: Partial<EventRecord>) => {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/admin/events/${event.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        tags: event.tags.join(", "),
        venue: event.venue ?? "",
        image: event.image ?? "",
        ...patch,
      }),
    });

    if (!response.ok) {
      setError("Couldn't save that.");
      setBusy(false);
      return;
    }

    setBusy(false);
    router.refresh();
  };

  const size = event.heroLogoSize ?? "md";
  const padTop = event.heroLogoPadTop ?? 0;
  const padBottom = event.heroLogoPadBottom ?? 0;

  const stepper = (
    label: string,
    value: number,
    field: "heroLogoPadTop" | "heroLogoPadBottom",
  ) => (
    <span className="flex items-center gap-1.5">
      <span className="text-bone/70">{label}</span>
      <button
        type="button"
        disabled={busy || value <= 0}
        aria-label={`Less ${label.toLowerCase()}`}
        onClick={() => save({ [field]: value - 1 })}
        className="border-bone/25 hover:border-bone/60 h-6 w-6 rounded-full border leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="w-4 text-center tabular-nums">{value}</span>
      <button
        type="button"
        disabled={busy || value >= 8}
        aria-label={`More ${label.toLowerCase()}`}
        onClick={() => save({ [field]: value + 1 })}
        className="border-bone/25 hover:border-bone/60 h-6 w-6 rounded-full border leading-none disabled:opacity-40"
      >
        +
      </button>
    </span>
  );

  return (
    <div
      data-edit-control=""
      className="border-sun/40 bg-ink/85 text-bone mt-3 inline-flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-4 py-2.5 text-[0.8125rem] backdrop-blur-sm"
    >
      <span className="flex items-center gap-1.5">
        <span className="text-bone/70">Logo size</span>
        {(["sm", "md", "lg"] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            aria-pressed={size === option}
            onClick={() => save({ heroLogoSize: option })}
            className={`rounded-full border px-2.5 py-1 uppercase disabled:opacity-40 ${
              size === option
                ? "border-sun bg-sun/20 text-sun"
                : "border-bone/25 hover:border-bone/60"
            }`}
          >
            {option}
          </button>
        ))}
      </span>

      {stepper("Space above", padTop, "heroLogoPadTop")}
      {stepper("Space below", padBottom, "heroLogoPadBottom")}

      {error ? <span className="text-sun">{error}</span> : null}
    </div>
  );
}

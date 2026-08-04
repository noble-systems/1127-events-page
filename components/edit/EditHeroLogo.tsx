"use client";

import type { EventRecord } from "@/lib/types";
import { useEdit } from "./EditContext";

/**
 * Size and spacing for the hero wordmark, adjusted while looking at it.
 *
 * Drafted, not auto-saved. The first version wrote the event on every click,
 * on the very page whose banner promises nothing is public until you save.
 * Now a click stages the change through the edit context: the preview updates
 * instantly, the banner counts it as an unsaved change, Save persists it and
 * Discard reverts it, exactly like every sentence on the page.
 *
 * The values displayed come off the event prop, which in edit mode is the
 * draft-overlaid event the preview renders, so panel and preview can never
 * disagree.
 */
export function EditHeroLogo({ event }: { event: EventRecord }) {
  const edit = useEdit();
  if (!edit) return null;

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
        disabled={value <= -4}
        aria-label={`Less ${label.toLowerCase()}`}
        onClick={() => edit.setHeroLogo({ [field]: value - 1 })}
        className="border-bone/25 hover:border-bone/60 h-6 w-6 rounded-full border leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center tabular-nums">{value}</span>
      <button
        type="button"
        disabled={value >= 8}
        aria-label={`More ${label.toLowerCase()}`}
        onClick={() => edit.setHeroLogo({ [field]: value + 1 })}
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
            aria-pressed={size === option}
            onClick={() => edit.setHeroLogo({ heroLogoSize: option })}
            className={`rounded-full border px-2.5 py-1 uppercase ${
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

      <span className="text-bone/50">Saves with Save changes, above</span>
    </div>
  );
}

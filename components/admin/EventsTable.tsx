"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toneBackground } from "@/components/ui/Media";
import type { EventRecord } from "@/lib/types";

export function EventsTable({ events }: { events: EventRecord[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePublished = async (event: EventRecord) => {
    setBusyId(event.id);
    setError(null);

    const response = await fetch(`/api/admin/events/${event.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        tags: event.tags.join(", "),
        venue: event.venue ?? "",
        image: event.image ?? "",
        published: !event.published,
      }),
    });

    if (!response.ok) {
      setError("Couldn't update that event. Please try again.");
    }
    setBusyId(null);
    router.refresh();
  };

  const remove = async (event: EventRecord) => {
    if (
      !window.confirm(
        `Delete "${event.name}"? This removes it from the site and can't be undone.`,
      )
    ) {
      return;
    }

    setBusyId(event.id);
    setError(null);

    const response = await fetch(`/api/admin/events/${event.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Couldn't delete that event. Please try again.");
    }
    setBusyId(null);
    router.refresh();
  };

  if (events.length === 0) {
    return (
      <div className="border-ink/25 bg-bone/60 rounded-2xl border border-dashed p-10 text-center">
        <p className="font-display text-xl">No events yet.</p>
        <p className="text-ink/65 mx-auto mt-3 max-w-sm text-[0.9375rem] leading-relaxed">
          Create one, or load the launch content from the overview page to start
          with Sun Club already filled in.
        </p>
        <Link
          href="/admin/events/new"
          className="bg-ink text-bone hover:bg-cobalt mt-6 inline-flex rounded-full px-5 py-2.5 text-[0.9375rem]"
        >
          New event
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="border-terracotta/40 bg-terracotta/[0.07] rounded-xl border px-4 py-3 text-[0.875rem]"
        >
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {events.map((event) => (
          <li
            key={event.id}
            className="border-ink/12 bg-bone flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-5"
          >
            <span
              aria-hidden="true"
              className="ring-ink/10 h-14 w-full shrink-0 rounded-xl ring-1 sm:h-14 sm:w-20"
              style={{ backgroundImage: toneBackground(event.tone) }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-xl leading-tight">{event.name}</h2>
                {event.featured ? (
                  <span className="bg-sun/25 text-sun-deep rounded-full px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase">
                    Featured
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase ${
                    event.published
                      ? "bg-cobalt/12 text-cobalt"
                      : "bg-ink/[0.08] text-ink/65"
                  }`}
                >
                  {event.published ? "Live" : "Draft"}
                </span>
              </div>
              <p className="text-ink/65 mt-1.5 truncate text-[0.875rem]">
                {event.date} · {event.location} · order {event.order}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => togglePublished(event)}
                disabled={busyId === event.id}
                className="border-ink/20 hover:border-ink/45 rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 disabled:opacity-50"
              >
                {event.published ? "Unpublish" : "Publish"}
              </button>
              <Link
                href={`/admin/events/${event.id}`}
                className="bg-ink text-bone hover:bg-cobalt rounded-full px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => remove(event)}
                disabled={busyId === event.id}
                className="text-terracotta-deep hover:border-terracotta/40 rounded-full border border-transparent px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

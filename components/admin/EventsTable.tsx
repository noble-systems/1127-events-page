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

  /**
   * Featured is one slot shared by every event, so choosing it here is a radio
   * rather than a tick on each. A tick per event let you set two, or none, and
   * left the hero to pick.
   */
  const feature = async (id: string | null) => {
    setBusyId(id ?? "__none__");
    setError(null);

    const response = await fetch("/api/admin/events/featured", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      setError("Couldn't change the featured event.");
      setBusyId(null);
      return;
    }

    setBusyId(null);
    router.refresh();
  };

  /**
   * Same shape as togglePublished below: the whole event goes back through the
   * validated PUT with one flag flipped. On means /tickets/<id> sells,
   * provided the event has ticket types; the server refuses the flip when
   * there are none, and that message is shown rather than a generic one.
   */
  const toggleSelling = async (event: EventRecord) => {
    setBusyId(event.id);
    setError(null);

    const response = await fetch(`/api/admin/events/${event.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        tags: event.tags.join(", "),
        image: event.image ?? "",
        ticketsEnabled: event.ticketsEnabled !== true,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        errors?: Record<string, string>;
        message?: string;
      } | null;
      setError(
        data?.errors?.tickets ??
          data?.message ??
          "Couldn't change selling for that event.",
      );
      setBusyId(null);
      return;
    }

    setBusyId(null);
    router.refresh();
  };

  const togglePublished = async (event: EventRecord) => {
    setBusyId(event.id);
    setError(null);

    const response = await fetch(`/api/admin/events/${event.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        tags: event.tags.join(", "),
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
          with the launch events already filled in.
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink/65 text-[0.875rem] leading-relaxed">
          The featured event fills the hero, drives{" "}
          <span className="whitespace-nowrap">/rsvp</span> and names the
          confirmation email. Only one at a time, and only a published one.
        </p>
        {events.some((event) => event.featured) ? (
          <button
            type="button"
            onClick={() => feature(null)}
            disabled={busyId !== null}
            className="text-ink/65 hover:text-ink shrink-0 text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
          >
            Feature nothing
          </button>
        ) : null}
      </div>

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
                {event.ticketsEnabled === true ? (
                  <span className="bg-sun/20 text-sun-deep rounded-full px-2.5 py-1 text-[0.75rem] tracking-[0.08em] uppercase">
                    Selling
                  </span>
                ) : null}
              </div>
              <p className="text-ink/65 mt-1.5 truncate text-[0.875rem]">
                {event.date} · {event.location} · order {event.order}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <label
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
                  event.published
                    ? "border-ink/20 hover:border-ink/45 cursor-pointer"
                    : "border-ink/10 text-ink/40 cursor-not-allowed"
                }`}
                title={
                  event.published
                    ? "Show this event in the hero"
                    : "A draft cannot be featured: the hero would describe something nobody can reach"
                }
              >
                <input
                  type="radio"
                  name="featured-event"
                  checked={event.featured}
                  disabled={!event.published || busyId !== null}
                  onChange={() => feature(event.id)}
                  className="accent-sun-deep h-3.5 w-3.5"
                />
                Feature
              </label>
              <button
                type="button"
                onClick={() => toggleSelling(event)}
                disabled={busyId === event.id}
                title={
                  event.ticketsEnabled === true
                    ? "Tickets are on sale at /tickets/" + event.id
                    : "Start selling at /tickets/" + event.id + " (needs ticket types on the event first)"
                }
                className="border-ink/20 hover:border-ink/45 rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 disabled:opacity-50"
              >
                {event.ticketsEnabled === true ? "Stop selling" : "Start selling"}
              </button>
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

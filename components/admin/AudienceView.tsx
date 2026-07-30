"use client";

import { useMemo, useState } from "react";
import {
  selectAudience,
  tallyByEvent,
  tallyByGenre,
  unattributed,
} from "@/lib/audience";
import { GENRES } from "@/lib/genres";
import type { SubmissionRecord } from "@/lib/types";

/**
 * Who gets a send.
 *
 * The count on screen and the addresses in the export come from the same
 * `selectAudience` call, so the number somebody sees before exporting is
 * necessarily the number of people they are about to email. Deriving them
 * separately is how a promo goes to more people than the dashboard claimed.
 */
export function AudienceView({
  records,
  events,
}: {
  records: SubmissionRecord[];
  events: { id: string; name: string }[];
}) {
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);

  const eventTally = useMemo(
    () => tallyByEvent(records, events),
    [records, events],
  );
  const genreTally = useMemo(() => tallyByGenre(records), [records]);
  const orphans = useMemo(() => unattributed(records), [records]);

  const audience = useMemo(
    () => selectAudience(records, { eventIds, genres }),
    [records, eventIds, genres],
  );

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    for (const id of eventIds) params.append("event", id);
    for (const g of genres) params.append("genre", g);
    return `/api/admin/audience?${params.toString()}`;
  }, [eventIds, genres]);

  const filtered = eventIds.length > 0 || genres.length > 0;

  return (
    <div className="space-y-10">
      {/* Where the list came from */}
      <section>
        <h2 className="font-display text-xl">Where your list came from</h2>
        <p className="text-ink/65 mt-2 text-[0.875rem] leading-relaxed">
          Mailable is the number you can actually email: opted in, not unsubscribed,
          not bounced. The gap between the two is worth watching.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="border-ink/12 bg-bone rounded-2xl border p-5">
            <h3 className="label-xs text-ink/65">By event</h3>
            {eventTally.length === 0 ? (
              <p className="text-ink/65 mt-3 text-[0.875rem]">
                No signups attributed to an event yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {eventTally.map((t) => (
                  <li
                    key={t.key}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="text-[0.9375rem]">{t.label}</span>
                    <span className="text-ink/65 text-[0.8125rem] whitespace-nowrap">
                      <strong className="text-ink font-medium">{t.mailable}</strong>{" "}
                      mailable / {t.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-ink/12 bg-bone rounded-2xl border p-5">
            <h3 className="label-xs text-ink/65">By genre</h3>
            {genreTally.length === 0 ? (
              <p className="text-ink/65 mt-3 text-[0.875rem]">
                No genres recorded yet. Tag your events with genres and new signups
                will carry them.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {genreTally.map((t) => (
                  <li
                    key={t.key}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="text-[0.9375rem]">{t.label}</span>
                    <span className="text-ink/65 text-[0.8125rem] whitespace-nowrap">
                      <strong className="text-ink font-medium">{t.mailable}</strong>{" "}
                      mailable / {t.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {orphans.length > 0 ? (
          <p className="border-ink/15 bg-sand/50 text-ink/75 mt-4 rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed">
            <strong className="font-medium">{orphans.length}</strong>{" "}
            {orphans.length === 1 ? "person is" : "people are"} not attributed to
            any event, so they appear in no genre segment. Anyone who signed up
            before events carried genres lands here. They still receive an
            unfiltered send.
          </p>
        ) : null}
      </section>

      {/* Build a segment */}
      <section>
        <h2 className="font-display text-xl">Build a segment</h2>
        <p className="text-ink/65 mt-2 text-[0.875rem] leading-relaxed">
          Pick nothing to reach everyone mailable. Picking several genres means
          anyone matching <em>any</em> of them.
        </p>

        <div className="mt-5 space-y-5">
          <div>
            <h3 className="label-xs text-ink/65 mb-2.5">Events</h3>
            <div className="flex flex-wrap gap-2">
              {events.map((event) => {
                const on = eventIds.includes(event.id);
                return (
                  <button
                    key={event.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setEventIds((prev) => toggle(prev, event.id))}
                    className={`rounded-full px-4 py-2 text-[0.875rem] transition-colors duration-200 ${
                      on
                        ? "bg-ink text-bone"
                        : "border-ink/20 text-ink/70 hover:border-ink/45 hover:text-ink border"
                    }`}
                  >
                    {event.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="label-xs text-ink/65 mb-2.5">Genres</h3>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => {
                const on = genres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGenres((prev) => toggle(prev, genre))}
                    className={`rounded-full px-4 py-2 text-[0.875rem] transition-colors duration-200 ${
                      on
                        ? "bg-cobalt text-bone"
                        : "border-ink/20 text-ink/70 hover:border-ink/45 hover:text-ink border"
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-ink/12 bg-bone mt-6 flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4">
          <p className="text-[1.0625rem]">
            <strong className="font-medium">{audience.length}</strong>{" "}
            {audience.length === 1 ? "person" : "people"} would receive this
          </p>
          <a
            href={exportHref}
            className="bg-ink text-bone hover:bg-cobalt rounded-full px-5 py-2.5 text-[0.875rem] transition-colors duration-200"
          >
            Export this segment
          </a>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setEventIds([]);
                setGenres([]);
              }}
              className="text-ink/65 hover:text-ink text-[0.8125rem] underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {audience.length > 0 ? (
          <div className="border-ink/12 bg-bone mt-5 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr className="border-ink/12 border-b">
                  {["Name", "Email", "Genres", "Events"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="label-xs text-ink/65 px-5 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audience.slice(0, 50).map((r) => (
                  <tr key={r.pk} className="border-ink/8 border-b last:border-b-0">
                    <td className="px-5 py-3 text-[0.9375rem]">{r.name || "—"}</td>
                    <td className="text-ink/70 px-5 py-3 text-[0.875rem]">
                      {r.email}
                    </td>
                    <td className="text-ink/70 px-5 py-3 text-[0.8125rem]">
                      {(r.genres ?? []).join(", ") || "Not recorded"}
                    </td>
                    <td className="text-ink/70 px-5 py-3 text-[0.8125rem]">
                      {(r.eventIds ?? []).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audience.length > 50 ? (
              <p className="text-ink/65 border-ink/12 border-t px-5 py-3 text-[0.8125rem]">
                Showing the first 50. The export contains all {audience.length}.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/admin/EventForm";
import { eventToFormValues } from "@/lib/event-input";
import { getEvent } from "@/lib/store";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) notFound();

  return (
    <>
      <Link
        href="/admin/events"
        className="label-xs text-ink/65 hover:text-ink underline-offset-4 hover:underline"
      >
        ← All events
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl leading-tight">{event.name}</h1>
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
      <p className="text-ink/65 mt-2.5 text-[0.9375rem]">
        Last updated {new Date(event.updatedAt).toLocaleString()}
      </p>

      <div className="mt-10">
        <EventForm initial={eventToFormValues(event)} eventId={event.id} />
      </div>
    </>
  );
}

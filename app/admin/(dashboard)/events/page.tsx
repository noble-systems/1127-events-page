import Link from "next/link";
import { EventsTable } from "@/components/admin/EventsTable";
import { StoreError } from "@/components/admin/StoreError";
import { listAllEventsSafe } from "@/lib/store";

export default async function AdminEventsPage() {
  const { events, error } = await listAllEventsSafe();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-tight">Events</h1>
          <p className="text-ink/65 mt-2.5 text-[0.9375rem]">
            {error
              ? "Couldn't reach the events store"
              : `${events.length} total · ${events.filter((event) => event.published).length} live on the site`}
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="bg-ink text-bone hover:bg-cobalt rounded-full px-5 py-3 text-[0.9375rem] transition-colors duration-200"
        >
          New event
        </Link>
      </div>

      <div className="mt-10">
        {error ? <StoreError message={error} /> : <EventsTable events={events} />}
      </div>
    </>
  );
}

import Link from "next/link";
import { EventForm } from "@/components/admin/EventForm";
import { getGenreList } from "@/lib/store";

export default async function NewEventPage() {
  const genreList = await getGenreList();

  return (
    <>
      <Link
        href="/admin/events"
        className="label-xs text-ink/65 hover:text-ink underline-offset-4 hover:underline"
      >
        ← All events
      </Link>

      <h1 className="mt-6 text-4xl leading-tight">New event</h1>
      <p className="text-ink/65 mt-2.5 max-w-xl text-[0.9375rem] leading-relaxed">
        Create it as a draft first, check how it looks, then publish. Nothing
        reaches the public site until Published is on.
      </p>

      <div className="mt-10">
        <EventForm genreList={genreList} />
      </div>
    </>
  );
}

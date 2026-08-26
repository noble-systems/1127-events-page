import type { Metadata } from "next";
import { AudienceView } from "@/components/admin/AudienceView";
import { mailingList } from "@/lib/audience";
import { GenreManager } from "@/components/admin/GenreManager";
import { getGenreList, listAllEvents, listSubmissions } from "@/lib/store";

export const metadata: Metadata = { title: "Audience" };
export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const [everyone, events, genreList] = await Promise.all([
    listSubmissions(),
    listAllEvents(),
    getGenreList(),
  ]);

  // RSVPs only. Applicants and partner enquiries are working contacts who live
  // in People; they are not a send target, so they must not appear here or in
  // any count used to decide who receives a promo.
  const records = mailingList(everyone);

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl">Audience</h1>
        <p className="text-ink/70 mt-3 text-[0.9375rem] leading-relaxed">
          Who to send to. People carry the genres of every event they signed up
          from, so a house crowd and a bass crowd are separate lists even though
          they live in the same table. Sending a dubstep promo to people who only
          ever came for house is how a list gets marked as spam.
        </p>
        <p className="text-ink/70 mt-3 text-[0.9375rem] leading-relaxed">
          This is the mailing list only. People who applied to work with us, or wrote in about
          a venue, are working contacts rather than an audience, so they live in
          People and never appear in a send.
        </p>
      </header>

      <div className="mt-10">
        <GenreManager genres={genreList} />
      </div>

      <div className="mt-10">
        <AudienceView
          records={records}
          events={events.map((event) => ({ id: event.id, name: event.name }))}
          genreList={genreList}
        />
      </div>
    </div>
  );
}

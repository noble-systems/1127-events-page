import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { mailingList, selectAudience } from "@/lib/audience";
import { submissionsToCsv } from "@/lib/csv";
import { listSubmissions } from "@/lib/store";

/**
 * GET /api/admin/audience?event=<id>&genre=<name>  → CSV of that segment
 *
 * Both parameters repeat, and both are optional. No filter means everyone
 * mailable, which is exactly what the dashboard shows with nothing selected.
 *
 * Uses the same `selectAudience` the screen uses, deliberately. If the count on
 * screen and the rows in the file came from separate code they would eventually
 * disagree, and the failure mode is emailing more people than you meant to.
 */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const eventIds = url.searchParams.getAll("event").filter(Boolean);
  const genres = url.searchParams.getAll("genre").filter(Boolean);

  // mailingList first, matching the screen exactly. isMailable already excludes
  // non-RSVPs, but filtering here too means the two can never drift apart.
  const audience = selectAudience(mailingList(await listSubmissions()), {
    eventIds,
    genres,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const label =
    [...genres, ...eventIds]
      .join("-")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 40) || "all";

  return new NextResponse(submissionsToCsv(audience), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="1127-audience-${label}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

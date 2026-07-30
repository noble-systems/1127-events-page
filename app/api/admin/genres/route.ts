import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { describePlan, planChange, type GenreChange } from "@/lib/genre-admin";
import {
  getGenreList,
  listAllEvents,
  listSubmissions,
  saveGenreList,
  updateSubmission,
  updateEventGenres,
} from "@/lib/store";

/**
 * GET  /api/admin/genres → the list in use
 * POST /api/admin/genres → { kind: "add" | "rename" | "delete", ... }
 *
 * Rename and delete are migrations, not edits. A genre lives on events and on
 * every person who signed up from one, so changing the list without rewriting
 * those records leaves people carrying a value that matches no segment. Nothing
 * errors; they simply stop receiving anything. So the records are rewritten
 * first, and only then is the list saved: an interrupted run leaves records
 * already migrated and the list stale, which the next attempt fixes. The other
 * order would leave people orphaned with nothing pointing at the problem.
 */

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, genres: await getGenreList() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as Record<string, unknown> | null;
  const kind = body?.kind;

  if (kind !== "add" && kind !== "rename" && kind !== "delete") {
    return NextResponse.json(
      { ok: false, message: "Unknown change." },
      { status: 400 },
    );
  }

  const change = {
    add: { kind: "add" as const, name: String(body?.name ?? "") },
    rename: {
      kind: "rename" as const,
      from: String(body?.from ?? ""),
      to: String(body?.to ?? ""),
    },
    delete: { kind: "delete" as const, name: String(body?.name ?? "") },
  }[kind] satisfies GenreChange;

  const [current, events, people] = await Promise.all([
    getGenreList(),
    listAllEvents(),
    listSubmissions(),
  ]);

  const plan = planChange(current, change, events, people);
  if (plan.error) {
    return NextResponse.json({ ok: false, message: plan.error }, { status: 400 });
  }

  try {
    // Records first. See the note above on ordering.
    for (const event of plan.events) {
      await updateEventGenres(event.id, event.genres);
    }
    for (const person of plan.people) {
      await updateSubmission(person.pk, { genres: person.genres });
    }
    await saveGenreList(plan.genres);
  } catch (error) {
    console.error("[1127] genre change failed part-way", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          "That change failed part-way through. Some records may already be updated; try again to finish it.",
      },
      { status: 502 },
    );
  }

  revalidatePath("/admin/audience");
  revalidatePath("/admin/events");

  return NextResponse.json({
    ok: true,
    genres: plan.genres,
    migrated: describePlan(plan),
  });
}

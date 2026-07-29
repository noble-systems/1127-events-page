import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { submissionsToCsv } from "@/lib/csv";
import { deleteSubmission, listSubmissions } from "@/lib/store";
import type { SubmissionType } from "@/lib/types";

function isType(value: string | null): value is SubmissionType {
  return value === "rsvp" || value === "ambassador" || value === "partner";
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const type = isType(typeParam) ? typeParam : undefined;

  const rows = await listSubmissions(type);

  if (url.searchParams.get("format") === "csv") {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `1127-${type ?? "all"}-${stamp}.csv`;

    return new NextResponse(submissionsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ ok: true, subscribers: rows });
}

/** Removes someone from the list, for unsubscribe and deletion requests. */
export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { pk?: unknown } | null;
  const pk = typeof body?.pk === "string" ? body.pk : "";

  if (!pk) {
    return NextResponse.json(
      { ok: false, message: "Missing record key." },
      { status: 400 },
    );
  }

  await deleteSubmission(pk);
  return NextResponse.json({ ok: true });
}

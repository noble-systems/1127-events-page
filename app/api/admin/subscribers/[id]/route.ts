import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { canResubscribe } from "@/lib/audience";
import { deleteSubmission, getSubmission, updateSubmissionMeta } from "@/lib/store";
import { fromUrlId } from "@/lib/ids";
import { statusesFor, type SubmissionStatus } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

function isStatusForType(
  value: unknown,
  type: Parameters<typeof statusesFor>[0],
): value is SubmissionStatus {
  return (
    typeof value === "string" &&
    (statusesFor(type) as readonly string[]).includes(value)
  );
}

export async function GET(_request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const pk = fromUrlId(id);
  if (!pk)
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  const submission = await getSubmission(pk);

  if (!submission) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, submission });
}

/** Updates pipeline status and internal notes. Never the submitted content. */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const pk = fromUrlId(id);
  if (!pk)
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  const body = (await readJson(request)) as Record<string, unknown> | null;

  const patch: { status?: SubmissionStatus; notes?: string } = {};

  // The valid statuses depend on what kind of submission this is, so the
  // record has to be loaded before the status can be judged.
  const existing = await getSubmission(pk);
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  /**
   * An opt-out the person made themselves is not an admin's to undo.
   *
   * Enforced here rather than only in the dashboard, because the button being
   * hidden is not the same as the action being refused: this endpoint takes a
   * plain PATCH.
   */
  if (
    body?.status === "subscribed" &&
    existing.status === "unsubscribed" &&
    !canResubscribe(existing)
  ) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "They unsubscribed themselves, so they can't be put back on the list from here. They'd need to sign up again.",
      },
      { status: 409 },
    );
  }

  if (body?.status !== undefined) {
    if (!isStatusForType(body.status, existing.type)) {
      return NextResponse.json(
        {
          ok: false,
          message: `"${String(body.status)}" is not a valid status for a ${existing.type} record.`,
        },
        { status: 400 },
      );
    }
    patch.status = body.status;
  }

  if (body?.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return NextResponse.json(
        { ok: false, message: "Notes must be text." },
        { status: 400 },
      );
    }
    if (body.notes.length > 5000) {
      return NextResponse.json(
        { ok: false, message: "Notes are too long (max 5000 characters)." },
        { status: 400 },
      );
    }
    patch.notes = body.notes;
  }

  const updated = await updateSubmissionMeta(pk, patch);

  if (!updated) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, submission: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const pk = fromUrlId(id);
  if (!pk)
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  await deleteSubmission(pk);
  return NextResponse.json({ ok: true });
}

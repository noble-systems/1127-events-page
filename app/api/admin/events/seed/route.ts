import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { restoreLaunchContent } from "@/lib/store";

/**
 * POST /api/admin/events/seed
 *
 * Re-adds any launch event that is missing. The store imports this content
 * automatically on first use, so this is a recovery path for events that were
 * deleted by mistake. Existing events are never overwritten.
 */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const created = await restoreLaunchContent();
  if (created > 0) revalidatePath("/");

  return NextResponse.json({
    ok: true,
    created,
    message:
      created > 0
        ? `Restored ${created} event${created === 1 ? "" : "s"} from the launch content.`
        : "Nothing to restore. The launch events are all present.",
  });
}

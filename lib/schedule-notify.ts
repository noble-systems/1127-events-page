import { sendScheduleChangeEmail, siteUrl } from "./email.ts";
import { listOrders } from "./tickets-store.ts";
import type { EventRecord } from "./types.ts";

/**
 * Whether an edit moved the event in time. Only the date and the hours
 * count; renaming a tier or rewording the summary is not something to wake
 * every buyer up about.
 */
export function scheduleChanged(
  before: Pick<EventRecord, "date" | "time">,
  after: Pick<EventRecord, "date" | "time">,
): boolean {
  const norm = (value?: string | null) => (value ?? "").trim();
  return (
    norm(before.date) !== norm(after.date) ||
    norm(before.time) !== norm(after.time)
  );
}

/**
 * Tells every ticket holder the new schedule, one email per paid order so
 * each lands with that order's own wallet link. Comps are holders too. A
 * single failed send is logged and skipped rather than aborting the rest;
 * the admin save must not fail because one address bounced.
 */
export async function notifyScheduleChange(event: EventRecord): Promise<number> {
  const ids = [event.id, ...(event.formerIds ?? [])];
  const holders = (await listOrders(ids)).filter(
    (order) =>
      order.status === "paid" && order.email && (order.codes?.length ?? 0) > 0,
  );

  let sent = 0;
  for (const order of holders) {
    try {
      await sendScheduleChangeEmail(order.email as string, {
        eventName: event.name,
        date: event.date,
        time: event.time ?? undefined,
        location: event.venue ?? event.location,
        walletUrl: `${siteUrl()}/t/${encodeURIComponent(order.ref)}`,
      });
      sent += 1;
    } catch (error) {
      console.error(
        "[1127] schedule-change email failed",
        event.id,
        order.ref,
        error,
      );
    }
  }
  return sent;
}

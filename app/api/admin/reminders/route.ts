import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import { sendReminderEmail, siteUrl } from "@/lib/email";
import {
  computeReminderTargets,
  createPromoCode,
  getReminderSettings,
  setReminderSettings,
} from "@/lib/reminder";
import { listSubmissions } from "@/lib/store";
import {
  listAllOrders,
  markOrderReminded,
  setOrderReminderRemoved,
} from "@/lib/tickets-store";
import { unsubscribeToken } from "@/lib/tokens";

/**
 * Abandoned-checkout reminders, admin only.
 *
 *   GET                      eligible emails + the discount settings
 *   PATCH {enabled, pct}     save the discount settings
 *   POST  {send: true}       send one reminder to every eligible email
 *
 * Sending stamps each target's order, so the same email can never receive
 * a second reminder, whatever happens later.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [orders, submissions, settings] = await Promise.all([
    listAllOrders(),
    listSubmissions(),
    getReminderSettings(),
  ]);
  const { targets, removed } = computeReminderTargets(orders, submissions);
  return NextResponse.json({
    ok: true,
    settings,
    targets: targets.map((t) => ({ email: t.email, event: t.order.eventName })),
    removed: removed.map((t) => ({ email: t.email, event: t.order.eventName })),
  });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    enabled?: unknown;
    pct?: unknown;
  } | null;
  const pct = typeof body?.pct === "number" ? Math.floor(body.pct) : NaN;
  if (typeof body?.enabled !== "boolean" || !Number.isInteger(pct) || pct < 1 || pct > 90) {
    return NextResponse.json(
      { ok: false, message: "Discount is 1 to 90 percent, on or off." },
      { status: 400 },
    );
  }

  await setReminderSettings({ enabled: body.enabled, pct });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { send?: unknown } | null;
  if (body?.send !== true) {
    return NextResponse.json(
      { ok: false, message: "Say send: true to actually send." },
      { status: 400 },
    );
  }

  const [orders, submissions, settings] = await Promise.all([
    listAllOrders(),
    listSubmissions(),
    getReminderSettings(),
  ]);
  const { targets } = computeReminderTargets(orders, submissions);

  let sent = 0;
  const failures: string[] = [];
  for (const target of targets) {
    const params = new URLSearchParams();
    if (target.order.via) params.set("via", target.order.via);
    if (target.order.src) params.set("src", target.order.src);
    if (settings.enabled) {
      // A one-time code minted per recipient: the link works exactly once.
      const code = await createPromoCode(target.email, settings.pct);
      params.set("promo", code.id);
    }
    const query = params.toString();
    const buyUrl = `${siteUrl()}/tickets/${encodeURIComponent(target.order.eventId)}${query ? `?${query}` : ""}`;

    try {
      await sendReminderEmail(target.email, {
        eventName: target.order.eventName,
        buyUrl,
        unsubUrl: `${siteUrl()}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(target.email))}`,
        ...(settings.enabled ? { discountPct: settings.pct } : {}),
      });
      // Stamped AFTER the send went through, so a failed send can retry on
      // the next run instead of silently never reaching that person.
      await markOrderReminded(target.order.ref);
      sent += 1;
    } catch (error) {
      console.error("[1127] reminder failed", target.email, error);
      failures.push(target.email);
    }
  }

  return NextResponse.json({ ok: true, sent, failed: failures.length });
}

/**
 * Toggles one email's by-hand strike-off: on the eligible list it gets
 * struck off; on the removed list it gets restored. A REAL send stays
 * permanent either way; only the hand-made stamp is reversible.
 */
export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as { email?: unknown } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json(
      { ok: false, message: "Say which email to remove." },
      { status: 400 },
    );
  }

  const [orders, submissions] = await Promise.all([
    listAllOrders(),
    listSubmissions(),
  ]);
  const lists = computeReminderTargets(orders, submissions);
  const target = lists.targets.find((t) => t.email === email);
  if (target) {
    await setOrderReminderRemoved(target.order.ref, true);
    return NextResponse.json({ ok: true });
  }

  // Restore: clear the strike-off from every order carrying it.
  const struck = lists.removed.find((t) => t.email === email);
  if (struck) {
    const stamped = orders.filter(
      (o) => o.email?.toLowerCase() === email && o.reminderRemovedAt,
    );
    for (const o of stamped) await setOrderReminderRemoved(o.ref, false);
    return NextResponse.json({ ok: true, restored: true });
  }

  return NextResponse.json(
    { ok: false, message: "That email isn't on either list." },
    { status: 404 },
  );
}

import { NextResponse } from "next/server";
import { readJson, requireAdmin } from "@/lib/admin-api";
import {
  isValidAmbassadorCode,
  normalizeAmbassadorCode,
} from "@/lib/ambassadors";
import {
  createAmbassador,
  getAmbassador,
  getOnboardTicket,
  getWelcomeTemplate,
  listAmbassadors,
  newStatsId,
  patchAmbassador,
  setAmbassadorActive,
  setOnboardTicket,
  setRewardEvery,
  setRewardTierName,
  setWelcomeTemplate,
} from "@/lib/ambassadors-store";
import { renameAmbassador } from "@/lib/ambassador-admin";
import { issueCompTickets } from "@/lib/comp-tickets";
import { sendAmbassadorWelcomeEmail, siteUrl } from "@/lib/email";
import { getEvent } from "@/lib/store";

/**
 * Ambassador codes, admin only.
 *
 *   GET             the list
 *   POST  {name, code}         mint a code
 *   PATCH {code, active}       switch attribution on or off
 *
 * There is deliberately no DELETE: a code that ever attributed anything is
 * part of the payout history, and deactivating stops the future without
 * rewriting the past.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, ambassadors: await listAmbassadors() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    name?: unknown;
    code?: unknown;
    email?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = normalizeAmbassadorCode(
    typeof body?.code === "string" ? body.code : "",
  );

  if (!name || name.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Give the ambassador a name." },
      { status: 400 },
    );
  }
  // Required, because the reward system sends their free tickets here.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Give the ambassador an email for their free tickets." },
      { status: 400 },
    );
  }
  if (!isValidAmbassadorCode(code)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Codes are 3 to 20 characters: letters, numbers and hyphens.",
      },
      { status: 400 },
    );
  }

  const created = await createAmbassador({
    code,
    name,
    email,
    active: true,
    statsId: newStatsId(),
    createdAt: new Date().toISOString(),
  });
  if (!created) {
    return NextResponse.json(
      { ok: false, message: "That code is already taken." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await readJson(request)) as {
    code?: unknown;
    active?: unknown;
    newCode?: unknown;
    email?: unknown;
    rewardEvery?: unknown;
    rewardTierName?: unknown;
    welcomeTemplate?: unknown;
    onboardTicket?: unknown;
    sendWelcome?: unknown;
    sendTicket?: unknown;
    markTicketSent?: unknown;
    ticketCode?: unknown;
  } | null;
  const code = normalizeAmbassadorCode(
    typeof body?.code === "string" ? body.code : "",
  );

  // Reward setting: how many sales earn a free ticket. Site-wide, not
  // per-code.
  if (typeof body?.rewardEvery === "number") {
    const every = Math.floor(body.rewardEvery);
    if (every < 0 || every > 100) {
      return NextResponse.json(
        {
          ok: false,
          message: "Free-ticket threshold is 1 to 100 sales, or 0 to turn it off.",
        },
        { status: 400 },
      );
    }
    await setRewardEvery(every);
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.rewardTierName === "string") {
    const tierName = body.rewardTierName.trim().slice(0, 60);
    await setRewardTierName(tierName);
    return NextResponse.json({ ok: true });
  }

  // The editable welcome email. Blank strings mean "standard wording".
  if (body?.welcomeTemplate && typeof body.welcomeTemplate === "object") {
    const raw = body.welcomeTemplate as { subject?: unknown; body?: unknown };
    const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
    const text = typeof raw.body === "string" ? raw.body.trim() : "";
    if (subject.length > 120 || text.length > 2000) {
      return NextResponse.json(
        { ok: false, message: "Subject up to 120 characters, body up to 2000." },
        { status: 400 },
      );
    }
    await setWelcomeTemplate({ subject, body: text });
    return NextResponse.json({ ok: true });
  }

  // The marketing-material list: replaces the whole set, order included.
  if (Array.isArray((body as { kitImages?: unknown })?.kitImages)) {
    const { isValidS3Key, s3Key, isS3Ref } = await import("@/lib/images");
    const refs = ((body as { kitImages: unknown[] }).kitImages ?? [])
      .filter((ref): ref is string => typeof ref === "string")
      .slice(0, 12);
    for (const ref of refs) {
      if (!isS3Ref(ref) || !isValidS3Key(s3Key(ref)) || !s3Key(ref).startsWith("kit/")) {
        return NextResponse.json(
          { ok: false, message: "That image reference isn't from the kit uploads." },
          { status: 400 },
        );
      }
    }
    const { setKitImages } = await import("@/lib/ambassadors-store");
    await setKitImages(refs);
    return NextResponse.json({ ok: true });
  }

  // Which event and type the one-click welcome ticket mints.
  if (body?.onboardTicket && typeof body.onboardTicket === "object") {
    const raw = body.onboardTicket as { eventId?: unknown; tierId?: unknown };
    const eventId = typeof raw.eventId === "string" ? raw.eventId.trim() : "";
    const tierId = typeof raw.tierId === "string" ? raw.tierId.trim() : "";
    if (eventId) {
      const event = await getEvent(eventId).catch(() => null);
      const tier = event?.ticketTiers?.find((row) => row.id === tierId);
      if (!event || !tier) {
        return NextResponse.json(
          { ok: false, message: "Pick a real event and ticket type." },
          { status: 400 },
        );
      }
      if (tier.externalUrl) {
        return NextResponse.json(
          { ok: false, message: "Off-site types can't be minted here." },
          { status: 400 },
        );
      }
    }
    await setOnboardTicket({ eventId, tierId });
    return NextResponse.json({ ok: true });
  }

  // One click: the welcome email with their link, stamped when it goes out.
  if (body?.sendWelcome === true) {
    const ambassador = await getAmbassador(code);
    if (!ambassador) {
      return NextResponse.json(
        { ok: false, message: "That ambassador does not exist." },
        { status: 404 },
      );
    }
    if (!ambassador.email) {
      return NextResponse.json(
        { ok: false, message: "No email on file for them yet." },
        { status: 400 },
      );
    }
    // Their stats page exists before the email that might mention it.
    if (!ambassador.statsId) {
      ambassador.statsId = newStatsId();
      await patchAmbassador(code, { statsId: ambassador.statsId });
    }
    const template = await getWelcomeTemplate();
    const { getKitImages } = await import("@/lib/ambassadors-store");
    const { resolveImageSrc } = await import("@/lib/images");
    const { listPublicEvents } = await import("@/lib/store");
    const kitImages = (await getKitImages())
      .map((ref) => resolveImageSrc(ref))
      .filter((url): url is string => Boolean(url));
    const featured = (await listPublicEvents().catch(() => [])).find(
      (event) => event.featured,
    );
    try {
      await sendAmbassadorWelcomeEmail(ambassador.email, {
        name: ambassador.name,
        code: ambassador.code,
        link: `${siteUrl()}/a/${ambassador.code}`,
        statsLink: `${siteUrl()}/me/${ambassador.statsId}`,
        eventName: featured?.name,
        kitImages,
        subject: template.subject,
        body: template.body,
      });
    } catch (error) {
      console.error("[1127] welcome email failed", code, error);
      return NextResponse.json(
        { ok: false, message: "The email could not be sent. Try again." },
        { status: 502 },
      );
    }
    await patchAmbassador(code, { welcomeEmailAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  /**
   * "They already have a ticket": records an EXISTING ticket code against
   * the row instead of minting anything. The code must name a real ticket,
   * so a stray click cannot mark anyone sent; the roster then says it was
   * marked by hand and shows which ticket.
   */
  if (body?.markTicketSent === true) {
    const ambassador = await getAmbassador(code);
    if (!ambassador) {
      return NextResponse.json(
        { ok: false, message: "That ambassador does not exist." },
        { status: 404 },
      );
    }
    const { extractTicketCode } = await import("@/lib/tickets");
    const ticketCode = extractTicketCode(
      typeof body?.ticketCode === "string" ? body.ticketCode : "",
    );
    if (!ticketCode) {
      return NextResponse.json(
        { ok: false, message: "That doesn't look like a ticket code (ABC-DEF-GHJ)." },
        { status: 400 },
      );
    }
    const { getTicket } = await import("@/lib/tickets-store");
    const ticket = await getTicket(ticketCode);
    if (!ticket) {
      return NextResponse.json(
        { ok: false, message: "No ticket with that code exists." },
        { status: 404 },
      );
    }
    await patchAmbassador(code, {
      welcomeTicketAt: new Date().toISOString(),
      welcomeTicketCode: ticketCode,
      welcomeTicketManual: true,
    });
    return NextResponse.json({ ok: true });
  }

  // One click: their welcome comp for the event picked in the setting.
  if (body?.sendTicket === true) {
    const ambassador = await getAmbassador(code);
    if (!ambassador) {
      return NextResponse.json(
        { ok: false, message: "That ambassador does not exist." },
        { status: 404 },
      );
    }
    if (!ambassador.email) {
      return NextResponse.json(
        { ok: false, message: "No email on file for them yet." },
        { status: 400 },
      );
    }
    const setting = await getOnboardTicket();

    /**
     * A ticket they already hold is RESENT, never minted twice: the same
     * codes, the same wallet link, a fresh email. The recorded code (set by
     * a previous send, or marked by hand) is checked first, then any comp
     * attributed to them; only an ambassador with nothing gets a mint.
     */
    const { getTicket, listAllOrders, getOrder } = await import(
      "@/lib/tickets-store"
    );

    let existing = null;
    if (ambassador.welcomeTicketCode) {
      const ticket = await getTicket(ambassador.welcomeTicketCode);
      const order = ticket ? await getOrder(ticket.orderId) : null;
      if (order?.codes?.length) existing = order;
    }
    if (!existing) {
      const comps = (await listAllOrders())
        .filter(
          (order) =>
            order.comp === true &&
            order.status === "paid" &&
            order.via === ambassador.code &&
            (order.codes?.length ?? 0) > 0,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      existing =
        comps.find(
          (order) => setting.eventId && order.eventId === setting.eventId,
        ) ?? comps[0] ?? null;
    }

    if (existing) {
      const { sendTicketEmail } = await import("@/lib/email");
      const eventRecord = await getEvent(existing.eventId).catch(() => null);
      try {
        await sendTicketEmail(ambassador.email, {
          eventName: existing.eventName,
          tierName: existing.tierName,
          quantity: existing.quantity,
          totalLabel: "On the house",
          codes: existing.codes ?? [],
          date: eventRecord?.date,
          time: eventRecord?.time ?? undefined,
          location: eventRecord?.location,
          walletUrl: `${siteUrl()}/t/${existing.ref}`,
        });
      } catch (error) {
        console.error("[1127] welcome ticket resend failed", code, error);
        return NextResponse.json(
          { ok: false, message: "The email could not be sent. Try again." },
          { status: 502 },
        );
      }
      await patchAmbassador(code, {
        welcomeTicketAt: new Date().toISOString(),
        welcomeTicketCode: existing.codes?.[0] ?? "",
        welcomeTicketManual: false,
      });
      return NextResponse.json({ ok: true, resent: true });
    }

    const event = setting.eventId
      ? await getEvent(setting.eventId).catch(() => null)
      : null;
    const tier = event?.ticketTiers?.find((row) => row.id === setting.tierId);
    if (!event || !tier) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Pick the welcome-ticket event and type in the setting first.",
        },
        { status: 400 },
      );
    }
    const issued = await issueCompTickets({
      event,
      tier,
      quantity: 1,
      email: ambassador.email,
      via: ambassador.code,
      note: "Welcome, on the house",
    });
    if (!issued.ok) {
      return NextResponse.json(
        { ok: false, message: issued.reason },
        { status: 409 },
      );
    }
    await patchAmbassador(code, {
      welcomeTicketAt: new Date().toISOString(),
      welcomeTicketCode: issued.order.codes?.[0] ?? "",
      welcomeTicketManual: false,
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.newCode === "string") {
    const renamed = await renameAmbassador(
      code,
      normalizeAmbassadorCode(body.newCode),
    );
    if (!renamed.ok) {
      return NextResponse.json(
        { ok: false, message: renamed.reason },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, message: "That email doesn't look right." },
        { status: 400 },
      );
    }
    await patchAmbassador(code, { email });
    return NextResponse.json({ ok: true });
  }

  if (!isValidAmbassadorCode(code) || typeof body?.active !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "Say which code, and what to change." },
      { status: 400 },
    );
  }

  await setAmbassadorActive(code, body.active);
  return NextResponse.json({ ok: true });
}

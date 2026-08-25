import type { Metadata } from "next";
import { formatMoney } from "@/lib/tickets";
import { getOrder, getTicket } from "@/lib/tickets-store";

/**
 * The ticket wallet: what a guest holds up at the door.
 *
 * One ticket per SCREEN, scroll-snapped, because the email stacked every QR
 * in one column and the door camera kept grabbing the neighbor. Here the
 * viewfinder can only ever see one code. Reached by the unguessable order
 * ref from the ticket email; already-scanned tickets say so, so a group
 * passing one phone around knows which are spent.
 *
 * Rendered fresh every request: the used stamps come from the door as it
 * happens.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your tickets" };

function phoenixClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function TicketWalletPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const order = ref && /^[a-f0-9-]{20,40}$/i.test(ref) ? await getOrder(ref) : null;
  if (!order || order.status !== "paid" || !order.codes?.length) {
    return (
      <main className="bg-deep text-bone flex h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-3xl">These tickets do not exist</p>
        <p className="text-bone/60 mt-3 max-w-sm text-[0.9375rem] leading-relaxed">
          This link does not match any paid order. If you just bought
          tickets, use the button in your confirmation email; that link is
          the real one.
        </p>
      </main>
    );
  }

  const tickets = await Promise.all(
    order.codes.map(async (code) => ({
      code,
      record: await getTicket(code).catch(() => null),
    })),
  );

  return (
    <main className="bg-deep text-bone h-dvh snap-y snap-mandatory overflow-y-auto">
      {tickets.map(({ code, record }, index) => {
        const used = record?.status === "used";
        const revoked = record?.status === "revoked";
        return (
          <section
            key={code}
            className="flex h-dvh snap-start flex-col items-center justify-center px-6 text-center"
          >
            <p className="text-sun-soft text-[0.8125rem] tracking-[0.2em] uppercase">
              {order.eventName}
            </p>
            <p className="font-display mt-1 text-2xl">{order.tierName}</p>

            <div
              className={`mt-6 rounded-2xl bg-white p-4 ${
                used || revoked ? "opacity-30" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/ticket-qr/${encodeURIComponent(code)}`}
                alt={`QR for ticket ${code}`}
                width={280}
                height={280}
                className="block"
              />
            </div>

            <p className="mt-4 font-mono text-lg tracking-wider">{code}</p>

            {used ? (
              <p className="bg-sun text-ink mt-3 rounded-full px-4 py-1.5 text-[0.9375rem] font-medium">
                Scanned in{record?.usedAt ? ` at ${phoenixClock(record.usedAt)}` : ""}
              </p>
            ) : revoked ? (
              <p className="bg-terracotta mt-3 rounded-full px-4 py-1.5 text-[0.9375rem] font-medium">
                No longer valid
              </p>
            ) : (
              <p className="text-bone/60 mt-3 text-[0.9375rem]">
                Show this at the door. Admits one.
              </p>
            )}

            <p className="text-bone/45 mt-8 text-[0.8125rem]">
              Ticket {index + 1} of {tickets.length}
              {tickets.length > 1 && index < tickets.length - 1
                ? " · swipe up for the next"
                : ""}
            </p>
            <p className="text-bone/35 mt-1 text-[0.75rem]">
              {order.quantity} x {order.tierName}, {formatMoney(order.amountCents)}
            </p>
          </section>
        );
      })}
    </main>
  );
}

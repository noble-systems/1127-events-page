import type { Metadata } from "next";
import { listAllEvents } from "@/lib/store";
import { squareConfigured } from "@/lib/square";
import { formatMoney, remainingFor } from "@/lib/tickets";
import { MintTickets } from "@/components/admin/MintTickets";
import { sweepStaleHolds } from "@/lib/ticket-sweep";
import { listOrders, listTicketsForEvents, readInventory } from "@/lib/tickets-store";
import type { TicketOrder, TicketRecord } from "@/lib/tickets";
import type { EventRecord, TicketTier } from "@/lib/types";

export const metadata: Metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

/**
 * Sales, by event and tier: sold against capacity, holds in flight, money
 * taken, and the order paper trail. Numbers here come from the same counters
 * the oversell guard enforces, so what this page says is what the pool
 * actually did.
 */

/**
 * One code with its door state: plain while unused, struck through with the
 * walk-in time once scanned, terracotta when revoked. The list IS the
 * guest-by-guest check-in tracker.
 */
function CodeChip({ code, ticket }: { code: string; ticket?: TicketRecord }) {
  if (ticket?.status === "used") {
    return (
      <span className="mr-2 inline-block whitespace-nowrap">
        <span className="text-ink/40 line-through">{code}</span>
        <span className="text-cobalt ml-1 font-sans text-[0.7rem]">
          in {ticket.usedAt ? phoenixTime(ticket.usedAt) : ""}
        </span>
      </span>
    );
  }
  if (ticket?.status === "revoked") {
    return (
      <span className="text-terracotta-deep mr-2 inline-block whitespace-nowrap line-through">
        {code}
      </span>
    );
  }
  return <span className="mr-2 inline-block whitespace-nowrap">{code}</span>;
}

function phoenixTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Reclaim abandoned checkouts BEFORE reading anything. The sweep otherwise
 * runs only when somebody starts a checkout, so on a quiet day a pending
 * order would sit on this page for hours looking like a stuck sale.
 */
async function sweepEventHolds(event: EventRecord): Promise<void> {
  const ids = [event.id, ...(event.formerIds ?? [])];
  for (const tier of event.ticketTiers ?? []) {
    await sweepStaleHolds(ids, tier.id, Date.now()).catch((error) =>
      console.error("[1127] tickets-page sweep failed", event.id, error),
    );
  }
}

async function tierRows(
  event: EventRecord,
  tiers: TicketTier[],
  orders: TicketOrder[],
) {
  const inventory = await readInventory(
    event.id,
    tiers.map((tier) => tier.id),
  );
  return tiers.map((tier) => {
    const counts = inventory.get(tier.id) ?? { taken: 0, sold: 0 };
    // Comped seats, minted or rewarded, live inside the same sold counter
    // that guards the pool. Split them out so Sold means paying people and
    // Gross means money that actually arrived.
    const comped = orders
      .filter(
        (order) =>
          order.status === "paid" &&
          order.comp === true &&
          order.tierId === tier.id,
      )
      .reduce((total, order) => total + order.quantity, 0);
    const sold = Math.max(0, counts.sold - comped);
    return {
      tier,
      sold,
      comped,
      held: Math.max(0, counts.taken - counts.sold),
      remaining: remainingFor(tier, counts.taken),
      grossCents: sold * tier.priceCents,
    };
  });
}

export default async function AdminTicketsPage() {
  const events = (await listAllEvents()).filter(
    (event) => (event.ticketTiers ?? []).length > 0,
  );

  const sections = await Promise.all(
    events.map(async (event) => {
      const ids = [event.id, ...(event.formerIds ?? [])];
      await sweepEventHolds(event);
      const tickets = await listTicketsForEvents(ids);
      const orders = await listOrders(ids);
      return {
        event,
        rows: await tierRows(event, event.ticketTiers ?? [], orders),
        orders,
        // code -> ticket, so each code in the orders table can wear its
        // check-in state without a lookup per code.
        byCode: new Map(tickets.map((ticket) => [ticket.code, ticket])),
        checkedIn: tickets.filter((ticket) => ticket.status === "used"),
      };
    }),
  );

  const configured = squareConfigured();

  return (
    <div className="pb-16">
      <h1 className="text-4xl">Tickets</h1>
      <p className="text-ink/65 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">
        Sales by ticket type, and every order. Sold counts come from the same
        counter that stops overselling; comps, minted or rewarded, sit in
        their own column and never count as sales. Refunds happen in the
        Square dashboard, which is also where the money itself lives.
      </p>

      {!configured ? (
        <p className="border-sun/50 bg-sun/10 mt-6 max-w-2xl rounded-xl border px-5 py-4 text-[0.9375rem]">
          Square isn&apos;t connected yet: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID
          and SQUARE_WEBHOOK_SIGNATURE_KEY are not set, so checkout is answering
          &quot;sales aren&apos;t switched on&quot;. Ticket types can still be
          set up on each event.
        </p>
      ) : null}

      {events.length > 0 ? (
        <div className="mt-6">
          <MintTickets
            events={events.map((event) => ({
              id: event.id,
              name: event.name,
              tiers: (event.ticketTiers ?? []).map((tier) => ({
                id: tier.id,
                name: tier.name,
              })),
            }))}
          />
        </div>
      ) : null}

      {sections.length === 0 ? (
        <p className="border-ink/25 bg-bone/60 text-ink/65 mt-10 rounded-2xl border border-dashed px-6 py-10 text-center text-[0.9375rem]">
          No events have ticket types yet. Add them on an event&apos;s edit
          page, under Tickets.
        </p>
      ) : null}

      {sections.map(({ event, rows, orders, byCode, checkedIn }) => (
        <section
          key={event.id}
          className="border-ink/12 bg-bone mt-8 rounded-2xl border p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl">{event.name}</h2>
            <p className="text-ink/55 text-[0.8125rem]">
              {event.ticketsEnabled === true && event.published
                ? "Selling"
                : "Not selling"}
              {" · "}
              <span className="tabular-nums">
                {formatMoney(rows.reduce((a, r) => a + r.grossCents, 0))}
              </span>{" "}
              taken
            </p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[0.875rem]">
              <thead>
                <tr className="text-ink/55 border-ink/10 border-b">
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Price</th>
                  <th className="py-2 pr-4 font-medium">Sold</th>
                  <th className="py-2 pr-4 font-medium">Comps</th>
                  <th className="py-2 pr-4 font-medium">On hold</th>
                  <th className="py-2 pr-4 font-medium">Left</th>
                  <th className="py-2 pr-4 font-medium">In</th>
                  <th className="py-2 font-medium">Gross</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ tier, sold, comped, held, remaining, grossCents }) => (
                  <tr key={tier.id} className="border-ink/5 border-b">
                    <td className="py-2.5 pr-4 font-medium">
                      {tier.name}
                      {tier.hidden ? (
                        <span className="text-ink/45 ml-2 text-[0.75rem] font-normal">
                          hidden
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {formatMoney(tier.priceCents)}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {sold} of {tier.capacity}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {comped > 0 ? comped : ""}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {held > 0 ? held : ""}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {remaining === 0 ? "Sold out" : remaining}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {(() => {
                        const walked = checkedIn.filter(
                          (ticket) => ticket.tierId === tier.id,
                        ).length;
                        return walked > 0 ? `${walked} of ${sold + comped}` : "";
                      })()}
                    </td>
                    <td className="py-2.5 tabular-nums">
                      {formatMoney(grossCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {orders.length > 0 ? (
            <details className="mt-5" open>
              <summary className="text-ink/70 cursor-pointer text-[0.875rem]">
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[0.8125rem]">
                  <thead>
                    <tr className="text-ink/55 border-ink/10 border-b">
                      <th className="py-2 pr-4 font-medium">When</th>
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium">Qty</th>
                      <th className="py-2 pr-4 font-medium">Amount</th>
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Phone</th>
                      <th className="py-2 pr-4 font-medium">Via</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Codes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 100).map((order) => (
                      <tr key={order.ref} className="border-ink/5 border-b align-top">
                        <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                          {phoenixTime(order.createdAt)}
                        </td>
                        <td className="py-2 pr-4">{order.tierName}</td>
                        <td className="py-2 pr-4 tabular-nums">{order.quantity}</td>
                        <td className="py-2 pr-4 tabular-nums">
                          {order.comp ? (
                            <span className="text-sun-deep">comp</span>
                          ) : (
                            formatMoney(order.amountCents)
                          )}
                        </td>
                        <td className="py-2 pr-4">{order.email ?? ""}</td>
                        <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                          {order.phone ?? ""}
                        </td>
                        <td className="py-2 pr-4 font-mono text-[0.75rem]">
                          {order.via ?? ""}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={
                              order.status === "paid"
                                ? "text-cobalt"
                                : order.status === "pending"
                                  ? "text-sun-deep"
                                  : order.status === "attention"
                                    ? "text-terracotta-deep font-semibold"
                                    : "text-ink/45"
                            }
                          >
                            {order.status === "attention"
                              ? "attention: paid, no seats. Refund in Square."
                              : order.status}
                          </span>
                        </td>
                        <td className="py-2 font-mono text-[0.75rem]">
                          {(order.codes ?? []).map((code) => (
                            <CodeChip
                              key={code}
                              code={code}
                              ticket={byCode.get(code)}
                            />
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <p className="text-ink/55 mt-4 text-[0.875rem]">No orders yet.</p>
          )}
        </section>
      ))}
    </div>
  );
}

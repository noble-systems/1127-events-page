import { SubscriberTable } from "@/components/admin/SubscriberTable";
import { formatMoney } from "@/lib/tickets";
import { listAllOrders } from "@/lib/tickets-store";
import { listSubmissions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminListPage() {
  const [rows, orders] = await Promise.all([listSubmissions(), listAllOrders()]);

  /**
   * What each address has bought, summarised for the list: paid orders only,
   * grouped so the People row can say "3 tickets, $55" without a join in the
   * client.
   */
  const ticketsByEmail: Record<string, string> = {};
  const byEmail = new Map<string, { count: number; cents: number }>();
  for (const order of orders) {
    if (order.status !== "paid" || !order.email) continue;
    const key = order.email.toLowerCase();
    const entry = byEmail.get(key) ?? { count: 0, cents: 0 };
    entry.count += order.quantity;
    entry.cents += order.amountCents;
    byEmail.set(key, entry);
  }
  for (const [email, { count, cents }] of byEmail) {
    ticketsByEmail[email] = `${count} ${count === 1 ? "ticket" : "tickets"}, ${formatMoney(cents)}`;
  }

  return (
    <>
      <h1 className="text-4xl leading-tight">People</h1>
      <p className="text-ink/65 mt-2.5 max-w-2xl text-[0.9375rem] leading-relaxed">
        Subscribers and ticket buyers, talent applications, ambassador
        applications and partner inquiries, each in their own list. Open a
        record to read what they sent, move it through the pipeline and keep
        internal notes. A gold line under an address is what they have bought.
      </p>

      <div className="mt-10">
        <SubscriberTable rows={rows} ticketsByEmail={ticketsByEmail} />
      </div>
    </>
  );
}

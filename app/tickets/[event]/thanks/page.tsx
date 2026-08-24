import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowIcon, ButtonLink } from "@/components/ui/Button";
import { formatMoney } from "@/lib/tickets";
import { getOrder } from "@/lib/tickets-store";

/**
 * Where Square sends the buyer back. Reads the order fresh on every request,
 * because the webhook that settles it races the redirect here: a buyer can
 * land seconds before the "paid" write, and a cached "processing" would
 * stick.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your tickets" };

type Props = {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export default async function ThanksPage({ params, searchParams }: Props) {
  const [{ event: eventId }, { ref }] = await Promise.all([
    params,
    searchParams,
  ]);

  const order = ref ? await getOrder(ref) : null;
  const paid = order?.status === "paid";

  return (
    <>
      <SiteHeader overlay={false} />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        <section className="shell py-16 md:py-24">
          <div className="border-ink/10 bg-bone-soft mx-auto max-w-xl rounded-3xl border p-8 sm:p-10">
            {paid ? (
              <>
                <p className="label-xs text-ink/65">Payment received</p>
                <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">
                  You&apos;re in.
                </h1>
                <p className="text-ink/70 mt-5 text-[1.0625rem] leading-relaxed">
                  {`${order.quantity} x ${order.tierName} for ${order.eventName}, ${formatMoney(order.amountCents)} paid.`}
                  {order.email
                    ? ` Your tickets are on their way to ${order.email}.`
                    : " Your tickets are on their way by email."}
                </p>

                {order.codes?.length ? (
                  <div className="mt-7">
                    <p className="text-ink/65 text-[0.875rem]">
                      Your {order.codes.length === 1 ? "code" : "codes"}, one
                      per person at the door:
                    </p>
                    <div className="mt-3 space-y-2">
                      {order.codes.map((code) => (
                        <p
                          key={code}
                          className="bg-ink/5 rounded-lg px-4 py-2.5 font-mono text-lg tracking-wider"
                        >
                          {code}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : order ? (
              <>
                <p className="label-xs text-ink/65">One moment</p>
                <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">
                  Payment processing
                </h1>
                <p className="text-ink/70 mt-5 text-[1.0625rem] leading-relaxed">
                  The payment is going through now. Refresh this page in a few
                  seconds; your tickets also arrive by email either way.
                </p>
              </>
            ) : (
              <>
                <p className="label-xs text-ink/65">Nothing here</p>
                <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">
                  No order to show
                </h1>
                <p className="text-ink/70 mt-5 text-[1.0625rem] leading-relaxed">
                  This page only means something right after a checkout. If you
                  just paid and landed here, check your email; the tickets
                  travel on their own.
                </p>
              </>
            )}

            <div className="mt-8">
              <ButtonLink
                href={paid ? "/" : `/tickets/${encodeURIComponent(eventId)}`}
                variant={paid ? "primary" : "outline"}
                size="md"
              >
                {paid ? "Back to the site" : "Back to tickets"}
                <ArrowIcon />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

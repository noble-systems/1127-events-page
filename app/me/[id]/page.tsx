import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ticketsSoldBy } from "@/lib/ambassadors";
import {
  getAmbassadorByStatsId,
  getKitImages,
  readAmbassadorClicks,
} from "@/lib/ambassadors-store";
import { resolveImageSrc } from "@/lib/images";
import { siteUrl } from "@/lib/email";
import { listAllOrders } from "@/lib/tickets-store";

/**
 * An ambassador's own numbers, at an address only they hold: the statsId is
 * random and never printed anywhere public, so the page is private the way
 * an unguessable ticket wallet is. Read-only, no money figures, nothing
 * about anyone else.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your numbers",
  robots: { index: false, follow: false },
};

export default async function AmbassadorStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ambassador = await getAmbassadorByStatsId((id ?? "").toLowerCase());
  if (!ambassador) notFound();

  const [clicks, orders, kitRefs] = await Promise.all([
    readAmbassadorClicks([ambassador.code]),
    listAllOrders(),
    getKitImages(),
  ]);
  const kit = kitRefs
    .map((ref) => resolveImageSrc(ref))
    .filter((src): src is string => Boolean(src));

  const taps = clicks.get(ambassador.code) ?? 0;
  const sold = ticketsSoldBy(ambassador.code, orders);
  const link = `${siteUrl()}/a/${ambassador.code}`;
  const firstName = ambassador.name.trim().split(/\s+/)[0] || "there";

  const numbers: Array<[string, number, string]> = [
    ["Link taps", taps, "times somebody opened your link"],
    ["Tickets sold", sold, "paid tickets credited to your code"],
  ];

  return (
    <main className="bg-deep text-bone flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-sun-soft text-[0.8125rem] tracking-[0.2em] uppercase">
          1127 Ambassadors
        </p>
        <h1 className="font-display mt-3 text-4xl">
          {`Hey ${firstName}.`}
        </h1>
        <p className="text-bone/65 mt-3 text-[0.9375rem] leading-relaxed">
          {`Your code is ${ambassador.code}. These numbers update live; keep this address to yourself.`}
        </p>

        <dl className="border-bone/15 bg-bone/10 mt-8 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
          {numbers.map(([label, value, hint]) => (
            <div key={label} className="bg-deep px-6 py-6">
              <dt className="label-xs text-bone/55">{label}</dt>
              <dd className="font-display mt-2 text-4xl leading-none">
                {value}
              </dd>
              <dd className="text-bone/50 mt-2 text-[0.8125rem] leading-snug">
                {hint}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-bone/15 bg-bone/10 mt-4 rounded-2xl border px-6 py-5">
          <p className="label-xs text-bone/55">Your link</p>
          <p className="mt-2 font-mono text-[0.9375rem] break-all select-all">
            {link}
          </p>
          <p className="text-bone/50 mt-2 text-[0.8125rem] leading-relaxed">
            Bio, stories, group chats. Everyone who signs up or buys through
            it counts as yours, and typing your code at checkout works too.
          </p>
        </div>

        {kit.length > 0 ? (
          <div className="border-bone/15 bg-bone/10 mt-4 rounded-2xl border px-6 py-5">
            <p className="label-xs text-bone/55">Material to post</p>
            <p className="text-bone/50 mt-2 text-[0.8125rem] leading-relaxed">
              Tap and hold an image to save it, then post it with your link.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {kit.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt="Post material"
                  className="block w-full rounded-lg"
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

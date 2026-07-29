import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { UnsubscribeForm } from "@/components/UnsubscribeForm";
import { readUnsubscribeToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Remove your address from the 1127 Events email list.",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const email = token ? readUnsubscribeToken(token) : null;

  return (
    <>
      <SiteHeader overlay={false} />

      <main id="main" className="bg-bone pt-[4.5rem] lg:pt-20">
        <div className="shell py-20 md:py-28">
          <div className="max-w-xl">
            {email && token ? (
              <UnsubscribeForm token={token} email={email} />
            ) : (
              <>
                <h1 className="text-[2.4rem] leading-[1.05] sm:text-5xl">
                  That link isn&apos;t valid
                </h1>
                <p className="text-ink/70 mt-5 text-[1.0625rem] leading-relaxed">
                  The unsubscribe link was incomplete or has been altered. Open the
                  link straight from the email, or reply to any 1127 email and
                  we&apos;ll take you off the list by hand.
                </p>
                <div className="mt-9">
                  <Link
                    href="/"
                    className="bg-ink text-bone hover:bg-cobalt rounded-full px-5 py-3 text-[0.9375rem] transition-colors duration-200"
                  >
                    Back to 1127 Events
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

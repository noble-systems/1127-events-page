import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { Wordmark } from "@/components/Wordmark";
import { authMode, currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const mode = authMode();
  const { next } = await searchParams;

  // Already signed in, go straight through.
  if (mode !== "unconfigured" && (await currentAdmin())) {
    redirect(next?.startsWith("/admin") ? next : "/admin");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-block hover:opacity-70">
          <Wordmark size="lg" />
        </Link>

        <div className="border-ink/12 bg-bone mt-8 rounded-3xl border p-7 shadow-[0_30px_70px_-50px_rgba(7,20,47,0.5)] sm:p-9">
          <h1 className="text-3xl leading-tight">Admin sign-in</h1>
          <p className="text-ink/65 mt-3 text-[0.9375rem] leading-relaxed">
            Manage events and the Sun Club email list.
          </p>

          {mode === "unconfigured" ? (
            <p className="border-terracotta/40 bg-terracotta/[0.06] text-ink/80 mt-7 rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed">
              No Cognito user pool is attached to this deployment, so sign-in is
              disabled. Deploy <code>infra/1127-infra.yaml</code> and set the
              Cognito environment variables in Amplify.
            </p>
          ) : (
            <div className="mt-7">
              <LoginForm next={next ?? "/admin"} />
            </div>
          )}

          {mode === "dev" ? (
            <div className="border-ink/25 bg-sand/50 mt-7 rounded-xl border border-dashed px-4 py-3.5">
              <p className="label-xs text-terracotta-deep">
                Local development mode
              </p>
              <p className="text-ink/70 mt-2.5 text-[0.875rem] leading-relaxed">
                No Cognito pool is configured and this isn&apos;t production, so a
                local sign-in is active. Default credentials are{" "}
                <code className="bg-ink/[0.07] rounded px-1.5 py-0.5">
                  admin@1127.local
                </code>{" "}
                /{" "}
                <code className="bg-ink/[0.07] rounded px-1.5 py-0.5">
                  1127-dev
                </code>
                , overridable with <code>DEV_ADMIN_EMAIL</code> and{" "}
                <code>DEV_ADMIN_PASSWORD</code>. This path is disabled in production
                builds.
              </p>
            </div>
          ) : null}
        </div>

        <p className="text-ink/55 mt-6 text-center text-[0.8125rem]">
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to the site
          </Link>
        </p>
      </div>
    </div>
  );
}

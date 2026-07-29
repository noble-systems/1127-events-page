import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { authMode, currentAdmin } from "@/lib/auth";

/** Reading cookies already opts these pages out of caching; be explicit. */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const mode = authMode();

  if (mode === "unconfigured") {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-3xl">Admin isn&apos;t configured</h1>
        <p className="text-ink/70 mt-4 text-[0.9375rem] leading-relaxed">
          This deployment has no Cognito user pool attached, so there is no safe way
          to sign in. Deploy <code>infra/1127-infra.yaml</code> and set{" "}
          <code>COGNITO_USER_POOL_ID</code> and <code>COGNITO_CLIENT_ID</code> in
          the Amplify environment variables, then redeploy.
        </p>
      </div>
    );
  }

  // Real verification. Middleware only checked that a cookie existed.
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <>
      <AdminNav email={admin.email} mode={admin.via} />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
        {children}
      </main>
    </>
  );
}

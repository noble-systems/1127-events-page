import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "1127 Admin",
  robots: { index: false, follow: false },
};

/**
 * Shared chrome-free wrapper for everything under /admin, including the sign-in
 * page. The authenticated shell and the auth check live one level down in
 * (dashboard)/layout.tsx so /admin/login is reachable without a session.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div className="bg-sand text-ink min-h-dvh">{children}</div>;
}

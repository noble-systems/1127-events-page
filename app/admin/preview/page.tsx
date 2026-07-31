import type { Metadata } from "next";
import { LiveEditor } from "@/components/admin/LiveEditor";
import { getSiteContent, listPublicEvents } from "@/lib/store";

export const metadata: Metadata = { title: "Edit the homepage" };
export const dynamic = "force-dynamic";

/**
 * The homepage with an editor attached.
 *
 * Deliberately outside the dashboard layout. The whole point is seeing the page
 * as a visitor sees it, and a sidebar with admin chrome around it would defeat
 * that. Access is still gated: the middleware covers everything under /admin
 * except the login route.
 */
export default async function PreviewPage() {
  const [events, stored] = await Promise.all([
    listPublicEvents(),
    getSiteContent(),
  ]);

  return <LiveEditor stored={stored} events={events} />;
}

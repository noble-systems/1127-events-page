import type { Metadata } from "next";
import { DoorPassManager } from "@/components/admin/DoorPassManager";
import { DoorScanner } from "@/components/admin/DoorScanner";
import { listDoorPasses } from "@/lib/door-store";

export const metadata: Metadata = { title: "Door" };
export const dynamic = "force-dynamic";

/**
 * The admin side of the door: mint and revoke the PINs door staff use at
 * /door, and a scanner of your own underneath, because the boss also works
 * the line.
 */
export default async function AdminDoorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [{ code }, passes] = await Promise.all([searchParams, listDoorPasses()]);

  return (
    <div className="pb-16">
      <h1 className="text-4xl">Door</h1>
      <p className="text-ink/65 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">
        Door staff work at <span className="font-medium">1127.events/door</span>,
        which opens nothing but the scanner. Their PINs live here.
      </p>

      <div className="mt-8">
        <DoorPassManager passes={passes} />
      </div>

      <h2 className="font-display mt-10 text-xl">Scan here instead</h2>
      <div className="mt-4">
        <DoorScanner prefill={code ?? ""} />
      </div>
    </div>
  );
}

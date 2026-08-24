import type { Metadata } from "next";
import { DoorScanner } from "@/components/admin/DoorScanner";

export const metadata: Metadata = { title: "Door" };
export const dynamic = "force-dynamic";

/**
 * The check-in station: open on a phone at the door, scan the QR from each
 * guest's ticket email. A code checks in exactly once; screenshots shared
 * around come up ALREADY USED with the time the real one walked in.
 */
export default async function AdminDoorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="pb-16">
      <h1 className="text-4xl">Door</h1>
      <p className="text-ink/65 mt-3 max-w-md text-[0.9375rem] leading-relaxed">
        Point the camera at the QR on a guest&apos;s ticket. Each code admits
        one person, once. No camera? Type the code instead.
      </p>

      <div className="mt-8">
        <DoorScanner prefill={code ?? ""} />
      </div>
    </div>
  );
}

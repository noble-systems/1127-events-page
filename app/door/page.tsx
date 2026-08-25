import type { Metadata } from "next";
import { DoorLogin } from "@/components/door/DoorLogin";
import { DoorSignOut } from "@/components/door/DoorSignOut";
import { DoorScanner } from "@/components/admin/DoorScanner";
import { currentAdmin } from "@/lib/auth";
import { currentDoorPass } from "@/lib/door-auth";

export const metadata: Metadata = { title: "Door" };
export const dynamic = "force-dynamic";

/**
 * The door station, standalone at /door: no admin shell, no admin access,
 * nothing but the scanner. Door staff sign in with the PIN the admin handed
 * them and hold this page all night (the session lasts 24 hours); an admin's
 * own session also opens it, so the boss can work the line without a PIN.
 */
export default async function DoorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; bad?: string }>;
}) {
  const [{ code, bad }, pass, admin] = await Promise.all([
    searchParams,
    currentDoorPass(),
    currentAdmin().catch(() => null),
  ]);

  const standing = pass?.label ?? (admin ? "Admin" : null);

  return (
    <main className="bg-bone min-h-dvh px-6 py-10">
      <div className="mx-auto max-w-md">
        <p className="font-display text-2xl">1127 Door</p>

        {standing ? (
          <>
            <div className="text-ink/65 mt-1 flex items-center justify-between text-[0.875rem]">
              <span>Working as {standing}</span>
              {pass ? <DoorSignOut /> : null}
            </div>
            <div className="mt-6">
              <DoorScanner prefill={code ?? ""} />
            </div>
          </>
        ) : (
          <>
            <p className="text-ink/65 mt-2 text-[0.9375rem] leading-relaxed">
              Enter the door PIN you were given, or scan the sign-in QR from
              the admin. Either signs this phone in for the next 24 hours.
            </p>
            {bad ? (
              <p role="alert" className="text-terracotta-deep mt-3 text-[0.875rem]">
                That QR or PIN didn&apos;t open the door. Ask for a fresh one.
              </p>
            ) : null}
            <div className="mt-6">
              <DoorLogin />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

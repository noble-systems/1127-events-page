"use client";

import { useRouter } from "next/navigation";

export function DoorSignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/door/logout", { method: "POST" }).catch(() => null);
        router.refresh();
      }}
      className="text-ink/60 hover:text-ink underline underline-offset-2"
    >
      Sign out
    </button>
  );
}

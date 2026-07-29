"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** One-shot import of the launch content into an empty events table. */
export function SeedButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/events/seed", { method: "POST" });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setMessage(data?.message ?? "Done.");
      router.refresh();
    } catch {
      setMessage("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={seed}
        disabled={busy}
        className="border-ink/20 hover:border-ink/45 rounded-full border px-5 py-3 text-[0.9375rem] transition-colors duration-200 disabled:opacity-50"
      >
        {busy ? "Loading…" : "Load launch content"}
      </button>
      {message ? (
        <p role="status" className="text-ink/70 mt-3 text-[0.875rem]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

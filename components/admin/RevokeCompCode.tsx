"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The void switch on one comp ticket code in the admin orders table. Valid
 * comps offer "void"; revoked ones offer "restore". Both confirm first, both
 * refresh the page so the strikethrough state is the store's, not ours.
 */
export function RevokeCompCode({
  code,
  revoked,
}: {
  code: string;
  revoked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const flip = async () => {
    const asked = revoked
      ? `Restore ${code}? It will scan at the door again.`
      : `Void ${code}? The door will refuse it until it's restored.`;
    if (!window.confirm(asked)) return;

    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, revoke: !revoked }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;
    if (!response?.ok || !data?.ok) {
      setMessage(data?.message ?? "That didn't work.");
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <span className="ml-1 whitespace-nowrap">
      <button
        type="button"
        disabled={busy}
        onClick={() => void flip()}
        className={`text-[0.7rem] underline underline-offset-2 ${
          revoked ? "text-cobalt" : "text-terracotta-deep"
        }`}
      >
        {revoked ? "restore" : "void"}
      </button>
      {message ? (
        <span className="text-terracotta-deep ml-1 text-[0.7rem]">{message}</span>
      ) : null}
    </span>
  );
}

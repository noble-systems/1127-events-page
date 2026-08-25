"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** PIN in, session cookie out, page refreshes into the scanner. */
export function DoorLogin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !pin.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/door/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok) {
        setMessage(data?.message ?? "That didn't work. Try again.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setMessage("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        type="text"
        value={pin}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        onChange={(event) => setPin(event.target.value.toUpperCase())}
        className="border-ink/20 bg-bone-soft w-full rounded-xl border px-4 py-4 text-center font-mono text-2xl tracking-[0.2em] uppercase"
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy || !pin.trim()}
        className="w-full justify-center"
      >
        {busy ? "Checking…" : "Open the door"}
      </Button>
      {message ? (
        <p role="alert" className="text-terracotta-deep text-center text-[0.875rem]">
          {message}
        </p>
      ) : null}
    </form>
  );
}

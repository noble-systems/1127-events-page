"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { DoorPass } from "@/lib/door-store";

/**
 * The roster of door PINs. Mint one per person or per post, hand the PIN
 * over at call time, and when a phone goes missing hit "Sign out of devices":
 * every session on that pass dies instantly while the PIN keeps working for
 * a fresh sign-in. Deactivate kills PIN and sessions both.
 */
export function DoorPassManager({ passes }: { passes: DoorPass[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const call = async (init: RequestInit) => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/door-passes", {
      headers: { "Content-Type": "application/json" },
      ...init,
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

  const patch = (id: string, action: string) =>
    call({ method: "PATCH", body: JSON.stringify({ id, action }) });

  return (
    <div className="border-ink/12 bg-bone rounded-2xl border p-6">
      <h2 className="font-display text-xl">Door passes</h2>
      <p className="text-ink/65 mt-2 max-w-2xl text-[0.8125rem] leading-relaxed">
        Door staff sign in at 1127.events/door with a PIN from this list; a
        session lasts 24 hours and opens nothing but the scanner. Sign out of
        devices ends every session on a pass the moment it lands; Deactivate
        retires the PIN too. Show QR puts the sign-in on screen: staff scan
        it with their camera and the phone is in, no typing.
      </p>

      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim()) {
            void call({ method: "POST", body: JSON.stringify({ label }) });
            setLabel("");
          }
        }}
      >
        <label className="text-ink/70 block text-[0.875rem]">
          Name or post
          <input
            type="text"
            value={label}
            disabled={busy}
            placeholder="Marco / west door"
            onChange={(event) => setLabel(event.target.value)}
            className="border-ink/20 bg-bone-soft mt-1.5 block w-56 rounded-lg border px-3 py-2 text-[0.9375rem]"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={busy || !label.trim()}
        >
          Create pass
        </Button>
      </form>
      {message ? (
        <p role="alert" className="text-terracotta-deep mt-3 text-[0.875rem]">
          {message}
        </p>
      ) : null}

      {passes.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[0.875rem]">
            <thead>
              <tr className="text-ink/55 border-ink/10 border-b">
                <th className="py-2 pr-4 font-medium">Who</th>
                <th className="py-2 pr-4 font-medium">PIN</th>
                <th className="py-2 pr-4 font-medium">Last used</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {passes.map((pass) => (
                <Fragment key={pass.id}>
                <tr className="border-ink/5 border-b">
                  <td
                    className={`py-2.5 pr-4 font-medium ${pass.active ? "" : "opacity-50"}`}
                  >
                    {pass.label}
                  </td>
                  <td
                    className={`py-2.5 pr-4 font-mono tracking-wider select-all ${pass.active ? "" : "opacity-50"}`}
                  >
                    {pass.pin}
                  </td>
                  <td className="text-ink/65 py-2.5 pr-4">
                    {pass.lastUsedAt
                      ? new Date(pass.lastUsedAt).toLocaleString("en-US", {
                          timeZone: "America/Phoenix",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "never"}
                  </td>
                  <td className="py-2.5">
                    <div className="flex gap-3">
                      {pass.active ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setQrFor(qrFor === pass.id ? null : pass.id)
                            }
                            className="text-cobalt text-[0.8125rem] underline underline-offset-2"
                          >
                            {qrFor === pass.id ? "Hide QR" : "Show QR"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patch(pass.id, "revoke")}
                            className="text-ink/60 hover:text-ink text-[0.8125rem] underline underline-offset-2"
                          >
                            Sign out of devices
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patch(pass.id, "deactivate")}
                            className="text-terracotta-deep hover:text-ink text-[0.8125rem] underline underline-offset-2"
                          >
                            Deactivate
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(pass.id, "activate")}
                          className="text-cobalt text-[0.8125rem] underline underline-offset-2"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {qrFor === pass.id && pass.active ? (
                  <tr className="border-ink/5 border-b">
                    <td colSpan={4} className="py-4">
                      <div className="flex items-center gap-5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/admin/door-passes/qr?id=${encodeURIComponent(pass.id)}`}
                          alt={`Sign-in QR for ${pass.label}`}
                          width={200}
                          height={200}
                          className="rounded-xl bg-white p-2"
                        />
                        <p className="text-ink/65 max-w-xs text-[0.8125rem] leading-relaxed">
                          Have {pass.label} scan this with their phone camera.
                          It signs them in for 24 hours. This picture is the
                          key; show it to your own people only.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackLinkStats } from "@/lib/track-links";
import { Button } from "@/components/ui/Button";

/**
 * The tracking-link desk: one obscure link per place a post goes, and the
 * numbers each place drove. Attribution math happens on the server; this
 * only displays it and edits the list.
 */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked; the text is visible to copy by hand */
        }
      }}
      className="text-cobalt hover:text-cobalt-soft text-[0.75rem] underline underline-offset-2"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function TrackLinksManager({
  stats,
  siteUrl,
}: {
  stats: TrackLinkStats[];
  siteUrl: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** Any request against the list; failures land in the message line. */
  const call = async (init: RequestInit) => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/track-links", {
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
    return Boolean(response?.ok && data?.ok);
  };

  return (
    <div>
      <div className="border-ink/12 bg-bone rounded-2xl border p-6">
        <h2 className="font-display text-xl">New tracking link</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-ink/70 block text-[0.875rem]">
            Where it will be posted
            <input
              type="text"
              value={label}
              disabled={busy}
              placeholder="IG story, Aug 30"
              onChange={(e) => setLabel(e.target.value)}
              className="border-ink/20 bg-bone-soft mt-1.5 block w-72 rounded-lg border px-3 py-2 text-[0.9375rem]"
            />
          </label>
          <Button
            onClick={async () => {
              if (
                await call({
                  method: "POST",
                  body: JSON.stringify({ label }),
                })
              ) {
                setLabel("");
              }
            }}
            disabled={busy || !label.trim()}
            variant="primary"
            size="md"
          >
            Create link
          </Button>
        </div>
        {message ? (
          <p role="alert" className="text-terracotta-deep mt-3 text-[0.875rem]">
            {message}
          </p>
        ) : null}
      </div>

      {stats.length === 0 ? (
        <p className="border-ink/25 bg-bone/60 text-ink/65 mt-6 rounded-2xl border border-dashed px-6 py-10 text-center text-[0.9375rem]">
          No tracking links yet. Create one per place you post (each story,
          the bio, a flyer QR) and this table shows what each one drove.
        </p>
      ) : (
        <div className="border-ink/12 bg-bone mt-6 overflow-x-auto rounded-2xl border p-6">
          <table className="w-full min-w-[720px] text-left text-[0.875rem]">
            <thead>
              <tr className="text-ink/55 border-ink/10 border-b">
                <th className="py-2 pr-4 font-medium">Posted at</th>
                <th className="py-2 pr-4 font-medium">Link</th>
                <th className="py-2 pr-4 font-medium">Taps</th>
                <th className="py-2 pr-4 font-medium">Orders</th>
                <th className="py-2 pr-4 font-medium">Tickets</th>
                <th className="py-2 pr-4 font-medium">Sales ($)</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const link = `${siteUrl}/l/${row.id}`;
                return (
                  <tr key={row.id} className="border-ink/5 border-b">
                    <td className="py-2.5 pr-4 font-medium">{row.label}</td>
                    <td className="py-2.5 pr-4">
                      <span className="mr-2 font-mono text-[0.8125rem] select-all">
                        {link}
                      </span>
                      <CopyButton text={link} />
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.taps}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.orders}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.tickets}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {"$" +
                        (row.grossCents / 100)
                          .toFixed(2)
                          .replace(/\.00$/, "")}
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            const next = window.prompt(
                              "New label for this link:",
                              row.label,
                            );
                            if (next && next.trim() && next.trim() !== row.label) {
                              void call({
                                method: "PATCH",
                                body: JSON.stringify({
                                  id: row.id,
                                  label: next.trim(),
                                }),
                              });
                            }
                          }}
                          className="text-cobalt text-[0.8125rem] underline underline-offset-2"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove "${row.label}"? The link stops working; sales it already drove stay counted on orders.`,
                              )
                            ) {
                              void call({
                                method: "DELETE",
                                body: JSON.stringify({ id: row.id }),
                              });
                            }
                          }}
                          className="text-terracotta-deep text-[0.8125rem] underline underline-offset-2"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

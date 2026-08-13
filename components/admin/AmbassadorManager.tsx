"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suggestAmbassadorCode, type AmbassadorStats } from "@/lib/ambassadors";
import { Button } from "@/components/ui/Button";

/**
 * The whole ambassador desk: mint codes, switch them off, hand out links.
 * Numbers arrive computed from the server; this component never does payout
 * math, it only displays it and edits the roster.
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

export function AmbassadorManager({
  stats,
  siteUrl,
}: {
  stats: AmbassadorStats[];
  siteUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok) {
        setMessage(data?.message ?? "Couldn't create that code.");
      } else {
        setName("");
        setCode("");
        setCodeTouched(false);
        router.refresh();
      }
    } catch {
      setMessage("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (target: string, active: boolean) => {
    await fetch("/api/admin/ambassadors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: target, active }),
    }).catch(() => null);
    router.refresh();
  };

  return (
    <div>
      <div className="border-ink/12 bg-bone rounded-2xl border p-6">
        <h2 className="font-display text-xl">New ambassador</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-ink/70 block text-[0.875rem]">
            Name
            <input
              type="text"
              value={name}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                if (!codeTouched) setCode(suggestAmbassadorCode(e.target.value));
              }}
              className="border-ink/20 bg-bone-soft mt-1.5 block w-56 rounded-lg border px-3 py-2 text-[0.9375rem]"
            />
          </label>
          <label className="text-ink/70 block text-[0.875rem]">
            Code
            <input
              type="text"
              value={code}
              disabled={busy}
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toUpperCase());
              }}
              className="border-ink/20 bg-bone-soft mt-1.5 block w-40 rounded-lg border px-3 py-2 text-[0.9375rem] tracking-wide uppercase"
            />
          </label>
          <Button
            onClick={create}
            disabled={busy || !name.trim() || !code.trim()}
            variant="primary"
            size="md"
          >
            Create code
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
          No ambassador codes yet. Create one above; the share link appears
          here the moment it exists.
        </p>
      ) : (
        <div className="border-ink/12 bg-bone mt-6 overflow-x-auto rounded-2xl border p-6">
          <table className="w-full min-w-[760px] text-left text-[0.875rem]">
            <thead>
              <tr className="text-ink/55 border-ink/10 border-b">
                <th className="py-2 pr-4 font-medium">Ambassador</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Share link</th>
                <th className="py-2 pr-4 font-medium">RSVPs</th>
                <th className="py-2 pr-4 font-medium">Tickets</th>
                <th className="py-2 pr-4 font-medium">Sales</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const link = `${siteUrl}/a/${row.code}`;
                return (
                  <tr
                    key={row.code}
                    className={`border-ink/5 border-b ${row.active ? "" : "opacity-50"}`}
                  >
                    <td className="py-2.5 pr-4 font-medium">{row.name}</td>
                    <td className="py-2.5 pr-4 font-mono">{row.code}</td>
                    <td className="py-2.5 pr-4">
                      <span className="mr-2 select-all">{link}</span>
                      <CopyButton text={link} />
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.rsvps}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.tickets}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {row.grossCents > 0
                        ? `$${(row.grossCents / 100).toFixed(2).replace(/\.00$/, "")}`
                        : ""}
                    </td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => toggle(row.code, !row.active)}
                        className="text-ink/60 hover:text-ink text-[0.8125rem] underline underline-offset-2"
                      >
                        {row.active ? "Deactivate" : "Reactivate"}
                      </button>
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

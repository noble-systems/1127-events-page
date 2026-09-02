"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The abandoned-checkout desk: who would get a reminder, the optional
 * discount, and the one button that sends. Eligibility is computed server
 * side; each email can only ever receive one reminder, so the button is
 * safe to press twice.
 */
export function ReminderPanel() {
  const [targets, setTargets] = useState<Array<{ email: string; event: string }>>([]);
  const [enabled, setEnabled] = useState(false);
  const [pct, setPct] = useState("10");
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [savedPct, setSavedPct] = useState("10");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/admin/reminders").catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      settings?: { enabled: boolean; pct: number };
      targets?: Array<{ email: string; event: string }>;
    } | null;
    if (data?.ok) {
      setTargets(data.targets ?? []);
      setEnabled(data.settings?.enabled ?? false);
      setPct(String(data.settings?.pct ?? 10));
      setSavedEnabled(data.settings?.enabled ?? false);
      setSavedPct(String(data.settings?.pct ?? 10));
    }
    setLoaded(true);
  };

  useEffect(() => {
    // Fetch-then-set on mount; the await breaks any synchronous cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const saveSettings = async () => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, pct: Number(pct) }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;
    if (!response?.ok || !data?.ok) {
      setMessage(data?.message ?? "That didn't work.");
    } else {
      setSavedEnabled(enabled);
      setSavedPct(pct);
    }
    setBusy(false);
  };

  const send = async () => {
    if (
      !window.confirm(
        `Send one reminder each to ${targets.length} ${targets.length === 1 ? "person" : "people"}${enabled ? ` with ${pct}% off` : ""}? Each address only ever gets one.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send: true }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      sent?: number;
      failed?: number;
      message?: string;
    } | null;
    if (!response?.ok || !data?.ok) {
      setMessage(data?.message ?? "That didn't work.");
    } else {
      setMessage(
        `Sent ${data.sent ?? 0}${data.failed ? `, ${data.failed} failed (they stay eligible for the next run)` : ""}.`,
      );
    }
    setBusy(false);
    void load();
  };

  return (
    <section className="border-ink/12 bg-bone mt-8 rounded-2xl border p-6">
      <h2 className="font-display text-2xl">Abandoned checkouts</h2>
      <p className="text-ink/65 mt-2 max-w-2xl text-[0.9375rem] leading-relaxed">
        People who opened the payment page, never paid, and never came back
        to buy anything. One reminder each, ever; anyone who has since bought
        or unsubscribed is excluded automatically. Their ambassador code and
        tracking link ride along, so credit still lands where it should.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="text-ink/70 flex items-center gap-2.5 text-[0.9375rem]">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-cobalt h-4 w-4"
          />
          Sweeten with a discount
        </label>
        <label className="text-ink/70 block text-[0.875rem]">
          Percent off
          <input
            type="number"
            min={1}
            max={90}
            value={pct}
            disabled={busy || !enabled}
            onChange={(e) => setPct(e.target.value)}
            className="border-ink/20 bg-bone-soft mt-1.5 block w-24 rounded-lg border px-3 py-2 text-[0.9375rem] tabular-nums"
          />
        </label>
        <Button
          variant="outline"
          size="md"
          disabled={busy || (enabled === savedEnabled && pct === savedPct)}
          onClick={() => void saveSettings()}
        >
          Save discount
        </Button>
      </div>
      <p className="text-ink/55 mt-2 max-w-2xl text-[0.8125rem] leading-relaxed">
        The discount link is signed: nobody can edit the percentage, and
        turning this off (or changing the number) kills every link already
        sent. Discounted checkouts show the reduced price on our page and on
        the Square receipt.
      </p>

      <div className="mt-5">
        {!loaded ? (
          <p className="text-ink/55 text-[0.875rem]">Counting...</p>
        ) : targets.length === 0 ? (
          <p className="text-ink/55 text-[0.875rem]">
            Nobody to remind right now. Abandoned checkouts show up here on
            their own.
          </p>
        ) : (
          <>
            <p className="text-ink/70 text-[0.9375rem]">
              {`${targets.length} ${targets.length === 1 ? "person" : "people"} eligible:`}
            </p>
            <ul className="text-ink/60 mt-2 max-h-40 space-y-1 overflow-y-auto text-[0.8125rem]">
              {targets.map((t) => (
                <li key={t.email} className="font-mono">
                  {`${t.email} (${t.event})`}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button
                variant="primary"
                size="md"
                disabled={busy}
                onClick={() => void send()}
              >
                {`Send ${targets.length} ${targets.length === 1 ? "reminder" : "reminders"}`}
              </Button>
            </div>
          </>
        )}
      </div>
      {message ? (
        <p role="alert" className="text-ink/70 mt-3 text-[0.875rem]">
          {message}
        </p>
      ) : null}
    </section>
  );
}

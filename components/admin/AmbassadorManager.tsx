"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suggestAmbassadorCode, type AmbassadorStats } from "@/lib/ambassadors";
import { resolveImageSrc } from "@/lib/images";
import { Button } from "@/components/ui/Button";

/**
 * The whole ambassador desk: mint codes, switch them off, hand out links.
 * Numbers arrive computed from the server; this component never does payout
 * math, it only displays it and edits the roster.
 */

/** "Aug 26", so a row can say when without eating the table. */
function sentDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
  });
}

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
  rewardEvery,
  rewardTierName,
  tierNames,
  welcomeSubject,
  welcomeBody,
  kitImages,
  onboardEventId,
  onboardTierId,
  events,
}: {
  stats: AmbassadorStats[];
  siteUrl: string;
  /** How many sales earn a free ticket, from the dashboard setting. */
  rewardEvery: number;
  /** Which ticket type the free one is; empty means same as the one sold. */
  rewardTierName: string;
  /** Every tier name across events, for the picker. */
  tierNames: string[];
  /** The editable welcome email; blank means the standard wording. */
  welcomeSubject: string;
  welcomeBody: string;
  /** Marketing-material refs ("s3:kit/...") shown in the welcome email. */
  kitImages: string[];
  /** Which event and type the one-click welcome ticket mints. */
  onboardEventId: string;
  onboardTierId: string;
  /** Events with mintable tiers, for the welcome-ticket picker. */
  events: Array<{
    id: string;
    name: string;
    tiers: Array<{ id: string; name: string }>;
  }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [threshold, setThreshold] = useState(String(rewardEvery));
  const [rewardTier, setRewardTier] = useState(rewardTierName);
  const [onboardEvent, setOnboardEvent] = useState(onboardEventId);
  const [onboardTier, setOnboardTier] = useState(onboardTierId);
  const [subject, setSubject] = useState(welcomeSubject);
  const [emailBody, setEmailBody] = useState(welcomeBody);
  const [kit, setKit] = useState(kitImages);
  const [uploading, setUploading] = useState(false);

  /** Straight-to-S3 like the event photos, then the ref list is saved. */
  const uploadKit = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const { shrinkImage } = await import("@/lib/shrink-image");
      const shrunk = await shrinkImage(file, "hero");
      const signed = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kit: true,
          filename: shrunk.name,
          contentType: shrunk.type,
        }),
      });
      const data = (await signed.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        ref?: string;
        cacheControl?: string;
        message?: string;
      } | null;
      if (!signed.ok || !data?.ok || !data.url || !data.ref) {
        setMessage(data?.message ?? "Could not start that upload.");
        return;
      }
      const put = await fetch(data.url, {
        method: "PUT",
        headers: {
          "Content-Type": shrunk.type,
          ...(data.cacheControl ? { "Cache-Control": data.cacheControl } : {}),
        },
        body: shrunk,
      });
      if (!put.ok) {
        setMessage(`S3 rejected the upload (${put.status}).`);
        return;
      }
      const next = [...kit, data.ref];
      setKit(next);
      await call({
        method: "PATCH",
        body: JSON.stringify({ kitImages: next }),
      });
    } catch {
      setMessage("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, email }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok) {
        setMessage(data?.message ?? "Couldn't create that code.");
      } else {
        setName("");
        setEmail("");
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

  /** Any PATCH against the roster; failures land in the message line. */
  const call = async (init: RequestInit) => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/ambassadors", {
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

  const toggle = (target: string, active: boolean) =>
    call({ method: "PATCH", body: JSON.stringify({ code: target, active }) });

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
            Email
            <input
              type="email"
              value={email}
              disabled={busy}
              placeholder="their@email.com"
              onChange={(e) => setEmail(e.target.value)}
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
            disabled={busy || !name.trim() || !code.trim() || !email.trim()}
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

      <div className="border-ink/10 mt-6 flex flex-wrap items-end gap-3 border-t pt-5">
        <label className="text-ink/70 block text-[0.875rem]">
          Free ticket after
          <span className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              disabled={busy}
              onChange={(e) => setThreshold(e.target.value)}
              className="border-ink/20 bg-bone-soft block w-24 rounded-lg border px-3 py-2 text-[0.9375rem] tabular-nums"
            />
            <span className="text-ink/65">tickets sold for an event</span>
          </span>
        </label>
        <label className="text-ink/70 block text-[0.875rem]">
          Free ticket type
          <select
            value={rewardTier}
            disabled={busy}
            onChange={(e) => setRewardTier(e.target.value)}
            className="border-ink/20 bg-bone-soft mt-1.5 block rounded-lg border px-3 py-2 text-[0.9375rem]"
          >
            <option value="">Same type as the ticket sold</option>
            {tierNames.map((tierName) => (
              <option key={tierName} value={tierName}>
                {tierName}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="md"
          disabled={
            busy ||
            (Number(threshold) === rewardEvery && rewardTier === rewardTierName)
          }
          onClick={async () => {
            if (Number(threshold) !== rewardEvery) {
              await call({
                method: "PATCH",
                body: JSON.stringify({ rewardEvery: Number(threshold) }),
              });
            }
            if (rewardTier !== rewardTierName) {
              await call({
                method: "PATCH",
                body: JSON.stringify({ rewardTierName: rewardTier }),
              });
            }
          }}
        >
          Save reward settings
        </Button>
        <p className="text-ink/55 basis-full text-[0.8125rem] leading-relaxed">
          When an ambassador&apos;s sales for one event reach this number, one
          free ticket for that event lands in their email automatically, as
          the type picked here when the event has it. One per event, no matter
          how many more they sell, and free tickets never count as sales.
          Setting it to 0 turns the free ticket off entirely.
          {Number(threshold) === 0 ? (
            <strong className="text-terracotta-deep font-medium">
              {" "}
              Rewards are currently off.
            </strong>
          ) : null}
        </p>
      </div>

      <div className="border-ink/10 mt-6 flex flex-wrap items-end gap-3 border-t pt-5">
        <label className="text-ink/70 block text-[0.875rem]">
          Welcome ticket event
          <select
            value={onboardEvent}
            disabled={busy}
            onChange={(e) => {
              setOnboardEvent(e.target.value);
              setOnboardTier("");
            }}
            className="border-ink/20 bg-bone-soft mt-1.5 block rounded-lg border px-3 py-2 text-[0.9375rem]"
          >
            <option value="">Not set</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink/70 block text-[0.875rem]">
          Ticket type
          <select
            value={onboardTier}
            disabled={busy || !onboardEvent}
            onChange={(e) => setOnboardTier(e.target.value)}
            className="border-ink/20 bg-bone-soft mt-1.5 block rounded-lg border px-3 py-2 text-[0.9375rem]"
          >
            <option value="">Pick a type</option>
            {(events.find((event) => event.id === onboardEvent)?.tiers ?? []).map(
              (tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ),
            )}
          </select>
        </label>
        <Button
          variant="outline"
          size="md"
          disabled={
            busy ||
            (onboardEvent === onboardEventId && onboardTier === onboardTierId) ||
            (Boolean(onboardEvent) && !onboardTier)
          }
          onClick={() =>
            call({
              method: "PATCH",
              body: JSON.stringify({
                onboardTicket: { eventId: onboardEvent, tierId: onboardTier },
              }),
            })
          }
        >
          Save welcome ticket
        </Button>
        <p className="text-ink/55 basis-full text-[0.8125rem] leading-relaxed">
          The Send ticket button on each row mints one free ticket of this
          type and emails it to them. Someone who already has a comp gets
          THAT ticket resent, never a second one.
        </p>
      </div>

      <div className="border-ink/10 mt-6 border-t pt-5">
        <h3 className="font-display text-lg">Welcome email</h3>
        <p className="text-ink/55 mt-1 text-[0.8125rem] leading-relaxed">
          Sent by the Send email button on each row.{" "}
          {"{name}"}, {"{code}"}, {"{link}"}, {"{stats}"} (their private
          numbers page) and {"{event}"} (the featured event&apos;s name) fill
          in automatically. Blank lines split paragraphs. Edit freely and
          save; what you see here is exactly what goes out.
        </p>
        <div className="mt-4 grid max-w-2xl gap-4">
          <label className="text-ink/70 block text-[0.875rem]">
            Subject
            <input
              type="text"
              value={subject}
              disabled={busy}
              placeholder="Your 1127 ambassador link"
              onChange={(e) => setSubject(e.target.value)}
              className="border-ink/20 bg-bone-soft mt-1.5 block w-full rounded-lg border px-3 py-2 text-[0.9375rem]"
            />
          </label>
          <label className="text-ink/70 block text-[0.875rem]">
            Body
            <textarea
              value={emailBody}
              disabled={busy}
              rows={7}
              placeholder={
                "Hey {name},\n\nYour personal link is below...\n\n{link}\n\nYour code is {code}."
              }
              onChange={(e) => setEmailBody(e.target.value)}
              className="border-ink/20 bg-bone-soft mt-1.5 block w-full rounded-lg border px-3 py-2 text-[0.9375rem] leading-relaxed"
            />
          </label>
          <div>
            <Button
              variant="outline"
              size="md"
              disabled={
                busy || (subject === welcomeSubject && emailBody === welcomeBody)
              }
              onClick={() =>
                call({
                  method: "PATCH",
                  body: JSON.stringify({
                    welcomeTemplate: { subject, body: emailBody },
                  }),
                })
              }
            >
              Save welcome email
            </Button>
          </div>

          <div className="border-ink/10 border-t pt-4">
            <p className="text-ink/70 text-[0.875rem] font-medium">
              Material to post
            </p>
            <p className="text-ink/55 mt-1 text-[0.8125rem] leading-relaxed">
              Images attached under the welcome email, and shown on each
              ambassador&apos;s numbers page, so they always have something to
              post. Up to 12.
            </p>
            {kit.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {kit.map((ref) => {
                  const src = resolveImageSrc(ref);
                  return (
                    <div key={ref} className="w-28">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt="Post material"
                          className="border-ink/15 block aspect-square w-28 rounded-lg border object-cover"
                        />
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || uploading}
                        onClick={() => {
                          const next = kit.filter((row) => row !== ref);
                          setKit(next);
                          void call({
                            method: "PATCH",
                            body: JSON.stringify({ kitImages: next }),
                          });
                        }}
                        className="text-terracotta-deep mt-1 text-[0.75rem] underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <label className="mt-3 inline-block">
              <span className="border-ink/20 hover:border-ink/45 inline-block cursor-pointer rounded-full border px-4 py-2 text-[0.875rem]">
                {uploading ? "Uploading..." : "Add an image"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={busy || uploading || kit.length >= 12}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadKit(file);
                }}
              />
            </label>
          </div>
        </div>
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
                <th className="py-2 pr-4 font-medium">Link taps</th>
                <th className="py-2 pr-4 font-medium">Signups</th>
                <th className="py-2 pr-4 font-medium">Tickets</th>
                <th className="py-2 pr-4 font-medium">Sales ($)</th>
                <th className="py-2 pr-4 font-medium">Free given</th>
                <th className="py-2 pr-4 font-medium">Welcome</th>
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
                      <div className="whitespace-nowrap">
                        <span className="mr-2 select-all">{link}</span>
                        <CopyButton text={link} />
                      </div>
                      {row.statsId ? (
                        <div className="mt-1 whitespace-nowrap text-[0.8125rem]">
                          <span className="text-ink/55 mr-2">
                            {`Their stats: ${siteUrl}/me/${row.statsId}`}
                          </span>
                          <CopyButton text={`${siteUrl}/me/${row.statsId}`} />
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.clicks}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.rsvps}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.tickets}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {"$" +
                        (row.grossCents / 100)
                          .toFixed(2)
                          .replace(/\.00$/, "")}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {row.rewardsGiven ?? 0}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="space-y-1 whitespace-nowrap text-[0.8125rem]">
                        <div>
                          {row.welcomeEmailAt ? (
                            <span className="text-ink/60">
                              Email {sentDay(row.welcomeEmailAt)}{" "}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void call({
                                method: "PATCH",
                                body: JSON.stringify({
                                  code: row.code,
                                  sendWelcome: true,
                                }),
                              })
                            }
                            className="text-cobalt underline underline-offset-2"
                          >
                            {row.welcomeEmailAt ? "Resend email" : "Send email"}
                          </button>
                        </div>
                        <div>
                          {row.welcomeTicketAt ? (
                            <span className="text-ink/60">
                              {`Ticket ${sentDay(row.welcomeTicketAt)}${
                                row.welcomeTicketManual
                                  ? ", marked by hand"
                                  : ""
                              }${
                                row.welcomeTicketCode
                                  ? ` (${row.welcomeTicketCode})`
                                  : ""
                              } `}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void call({
                                method: "PATCH",
                                body: JSON.stringify({
                                  code: row.code,
                                  sendTicket: true,
                                }),
                              })
                            }
                            className="text-cobalt underline underline-offset-2"
                          >
                            {row.welcomeTicketAt ? "Resend ticket" : "Send ticket"}
                          </button>
                          {!row.welcomeTicketAt ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const typed = window.prompt(
                                  `${row.name} already has a ticket? Type its code (ABC-DEF-GHJ) to record it without minting another.`,
                                );
                                if (typed && typed.trim()) {
                                  void call({
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      code: row.code,
                                      markTicketSent: true,
                                      ticketCode: typed.trim(),
                                    }),
                                  });
                                }
                              }}
                              className="text-ink/55 hover:text-ink ml-3 underline underline-offset-2"
                            >
                              Mark sent
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            const next = window.prompt(
                              `New code for ${row.name}. Their old link stops working; hand them the new one.`,
                              row.code,
                            );
                            if (next && next.trim().toUpperCase() !== row.code) {
                              void call({
                                method: "PATCH",
                                body: JSON.stringify({
                                  code: row.code,
                                  newCode: next.trim(),
                                }),
                              });
                            }
                          }}
                          className="text-cobalt text-[0.8125rem] underline underline-offset-2"
                        >
                          Change code
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = window.prompt(
                              `Where do ${row.name}’s free tickets go?`,
                              row.email ?? "",
                            );
                            if (next && next.trim()) {
                              void call({
                                method: "PATCH",
                                body: JSON.stringify({
                                  code: row.code,
                                  email: next.trim(),
                                }),
                              });
                            }
                          }}
                          className={`text-[0.8125rem] underline underline-offset-2 ${row.email ? "text-ink/60 hover:text-ink" : "text-terracotta-deep font-medium"}`}
                        >
                          {row.email ? "Email" : "No email!"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(row.code, !row.active)}
                          className="text-ink/60 hover:text-ink text-[0.8125rem] underline underline-offset-2"
                        >
                          {row.active ? "Deactivate" : "Reactivate"}
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

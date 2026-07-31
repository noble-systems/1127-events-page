"use client";

import { useEffect, useState } from "react";
import { Field, TextArea, TextInput } from "@/components/forms/Fields";

/**
 * Writes and sends a campaign to the segment picked above it.
 *
 * The segmentation machinery existed for months with no way to actually send:
 * counts, tallies and a CSV export, and then you were on your own. This is the
 * missing last step, deliberately in the same screen as the segment picker so
 * the number you see is the number you send to.
 *
 * Sending is a three-step gate: write, test-send to your own inbox, then send
 * for real behind a typed confirmation. The batching loop lives here because
 * one request cannot outlive the platform timeout on a large list; each batch
 * reports back and the progress line shows genuine progress, not a spinner.
 */
export function CampaignComposer({
  eventIds,
  genres,
  count,
  segmentLabel,
}: {
  eventIds: string[];
  genres: string[];
  count: number;
  segmentLabel: string;
}) {
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(
    null,
  );
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(
    null,
  );

  const ready = subject.trim() !== "" && body.trim() !== "";

  /**
   * The preview beside the fields, rendered by the same function that renders
   * the real send, fetched as you type. A composer with no preview meant the
   * first time anyone saw the email was in the test send's inbox, and the
   * second was in everybody's.
   */
  // Shown only while the form has content; clearing a field hides the stale
  // render without a state write inside the effect.
  const shownPreview = ready ? preview : null;

  useEffect(() => {
    if (!ready) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "preview", subject, heading, body }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          subject?: string;
          html?: string;
        } | null;
        if (data?.ok && data.html) {
          setPreview({ subject: data.subject ?? subject, html: data.html });
        }
      } catch {
        /* A stale keystroke's fetch was aborted; the next one will land. */
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, subject, heading, body]);

  const post = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        heading,
        body,
        eventIds,
        genres,
        ...payload,
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      sent?: number;
      failed?: number;
      total?: number;
      nextOffset?: number | null;
    } | null;
    if (!response.ok || !data?.ok) {
      throw new Error(data?.message ?? "The server refused that.");
    }
    return data;
  };

  const sendTest = async () => {
    setBusy("test");
    setError(null);
    setNote(null);
    try {
      await post({ mode: "test" });
      setNote(
        "Test sent to your own inbox. Read it there before sending for real.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test send failed.");
    } finally {
      setBusy(null);
    }
  };

  const sendReal = async () => {
    /**
     * A typed count, not an OK button. Confirmation dialogs get clicked
     * through; typing the number of people you are about to email is the one
     * prompt that makes the size of the action register.
     */
    const answer = window.prompt(
      `This sends to ${count} ${count === 1 ? "person" : "people"} (${segmentLabel}) and cannot be recalled.\n\nType the number ${count} to confirm.`,
    );
    if (answer?.trim() !== String(count)) {
      if (answer !== null)
        setError("The number didn't match, so nothing was sent.");
      return;
    }

    setBusy("send");
    setError(null);
    setNote(null);
    setProgress({ sent: 0, total: count });

    try {
      let offset: number | null = 0;
      let sent = 0;
      let failed = 0;

      while (offset !== null) {
        const data = await post({ mode: "send", offset });
        sent += data.sent ?? 0;
        failed += data.failed ?? 0;
        setProgress({ sent, total: data.total ?? count });
        offset = data.nextOffset ?? null;
      }

      setNote(
        failed === 0
          ? `Sent to ${sent} ${sent === 1 ? "person" : "people"}. A summary went to the team inbox.`
          : `Sent to ${sent}, ${failed} failed. The failures are in the server log; a summary went to the team inbox.`,
      );
      setSubject("");
      setHeading("");
      setBody("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} Sending stopped; the batches already out cannot be recalled.`
          : "Sending stopped partway.",
      );
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <section className="border-ink/12 bg-bone mt-12 rounded-2xl border p-6 sm:p-8">
      <h2 className="font-display text-2xl">Email this segment</h2>
      <p className="text-ink/65 mt-2 max-w-2xl text-[0.9375rem] leading-relaxed">
        Goes to the {count} {count === 1 ? "person" : "people"} matching the filters
        above ({segmentLabel}). Write it, send yourself the test, read the test,
        then send. {"{name}"} becomes the reader&apos;s first name.
      </p>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-2">
        <div className="grid gap-5">
          <Field id="camp-subject" label="Subject">
            <TextInput
              id="camp-subject"
              name="subject"
              value={subject}
              disabled={busy !== null}
              placeholder="The next date is live"
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>

          <Field
            id="camp-heading"
            label="Heading"
            hint="The large line at the top. Blank uses the subject."
          >
            <TextInput
              id="camp-heading"
              name="heading"
              value={heading}
              disabled={busy !== null}
              onChange={(e) => setHeading(e.target.value)}
            />
          </Field>

          <Field
            id="camp-body"
            label="Body"
            hint="Plain text. Blank lines make paragraphs. Every message carries the unsubscribe link and postal address automatically."
          >
            <TextArea
              id="camp-body"
              name="body"
              rows={8}
              value={body}
              disabled={busy !== null}
              placeholder={"Hey {name},\n\nThe next date is set..."}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <p className="label-xs text-ink/65">Preview</p>
          {shownPreview ? (
            <>
              <p className="border-ink/12 bg-bone-soft mt-2.5 truncate rounded-t-xl border border-b-0 px-4 py-2.5 text-[0.875rem]">
                <span className="text-ink/50">Subject:</span> {shownPreview.subject}
              </p>
              {/*
                sandbox with no allowances: the HTML is our own template, but
                the body text inside it is typed by whoever is signed in, and a
                preview pane that can run script is a door for trouble nobody
                needs. Links inside are inert too, which stops a stray click on
                the unsubscribe link opting out the preview address.
              */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={shownPreview.html}
                className="border-ink/12 bg-bone h-[480px] w-full rounded-b-xl border"
              />
              <p className="text-ink/50 mt-2 text-[0.75rem] leading-relaxed">
                Rendered by the same code as the real send, with a stand-in reader
                named Alex. The test send is this exact email in your inbox.
              </p>
            </>
          ) : (
            <div className="border-ink/25 bg-bone/60 text-ink/65 mt-2.5 flex h-[480px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-[0.875rem]">
              Write a subject and body and the email appears here as you type.
            </div>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-terracotta-deep mt-5 text-[0.9375rem]">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="text-cobalt mt-5 text-[0.9375rem]">
          {note}
        </p>
      ) : null}
      {progress ? (
        <p role="status" className="text-ink/70 mt-5 text-[0.9375rem]">
          Sending: {progress.sent} of {progress.total}…
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={sendTest}
          disabled={!ready || busy !== null}
          className="border-ink/20 hover:border-ink/45 rounded-full border px-5 py-2.5 text-[0.9375rem] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "test" ? "Sending test…" : "Send me the test"}
        </button>

        <button
          type="button"
          onClick={sendReal}
          disabled={!ready || busy !== null || count === 0}
          className="bg-ink text-bone hover:bg-cobalt rounded-full px-5 py-2.5 text-[0.9375rem] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "send" ? "Sending…" : `Send to ${count}`}
        </button>

        {count === 0 ? (
          <span className="text-ink/65 text-[0.8125rem]">
            Nobody mailable in this segment.
          </span>
        ) : null}
      </div>
    </section>
  );
}

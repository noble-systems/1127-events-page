"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/forms/Fields";
import { toUrlId } from "@/lib/ids";
import { describeSource } from "@/lib/request-meta";
import {
  STATUS_LABELS,
  normaliseStatus,
  statusesFor,
  type SubmissionRecord,
  type SubmissionStatus,
} from "@/lib/types";

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  const isEmail = label === "Email";
  const isPhone = label === "Phone";

  return (
    <div className="border-ink/10 flex flex-col gap-1 border-b py-3 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="label-xs text-ink/65 w-36 shrink-0">{label}</dt>
      <dd className="min-w-0 text-[0.9375rem] break-words">
        {isEmail ? (
          <a
            href={`mailto:${value}`}
            className="text-cobalt underline-offset-4 hover:underline"
          >
            {value}
          </a>
        ) : isPhone ? (
          <a
            href={`tel:${value.replace(/[^\d+]/g, "")}`}
            className="text-cobalt underline-offset-4 hover:underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function SubmissionDetail({ submission }: { submission: SubmissionRecord }) {
  const router = useRouter();
  const [status, setStatus] = useState<SubmissionStatus>(
    normaliseStatus(submission.type, submission.status),
  );
  const options = statusesFor(submission.type);
  const [notes, setNotes] = useState(submission.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = toUrlId(submission.pk);
  const meta = submission.meta;

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(`/api/admin/subscribers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "Couldn't save that.");
        return false;
      }
      setSaved(true);
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next: SubmissionStatus) => {
    const previous = status;
    setStatus(next); // optimistic, the dropdown shouldn't lag
    if (!(await patch({ status: next }))) setStatus(previous);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      {/* What they actually sent */}
      <div className="lg:col-span-7">
        <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
          <h2 className="font-display text-xl">Submitted details</h2>

          <dl className="border-ink/10 mt-5 border-t">
            <Row label="Name" value={submission.name} />
            <Row label="Email" value={submission.email} />
            <Row label="Phone" value={submission.phone} />
            <Row label="Role" value={submission.role} />
            <Row label="Community" value={submission.community} />
            <Row label="Links / social" value={submission.social} />
            <Row label="Company" value={submission.company} />
            <Row label="Inquiry type" value={submission.inquiryType} />
          </dl>

          {submission.message ? (
            <div className="mt-7">
              <h3 className="label-xs text-ink/65">In their words</h3>
              <p className="bg-ink/[0.04] mt-3 rounded-xl px-5 py-4 text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
                {submission.message}
              </p>
            </div>
          ) : null}

          <dl className="border-ink/10 mt-7 border-t pt-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="label-xs text-ink/65">First seen</dt>
                <dd className="mt-1 text-[0.875rem]">
                  {new Date(submission.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="label-xs text-ink/65">Last activity</dt>
                <dd className="mt-1 text-[0.875rem]">
                  {new Date(submission.updatedAt).toLocaleString()}
                </dd>
              </div>
            </div>
          </dl>
        </section>

        <section className="border-ink/12 bg-bone mt-6 rounded-2xl border p-6 sm:p-8">
          <h2 className="font-display text-xl">Consent</h2>
          <p className="text-ink/65 mt-2 text-[0.875rem] leading-relaxed">
            What they agreed to at the moment they submitted, with the timestamp and
            IP above as the record of it.
          </p>
          <dl className="border-ink/10 mt-5 border-t">
            <Row
              label="Terms and privacy"
              value={
                submission.termsVersion
                  ? `Accepted, version ${submission.termsVersion}`
                  : "Not recorded (submitted before consent capture)"
              }
            />
            <Row
              label="Event email"
              value={submission.marketingOptIn ? "Opted in" : "Not opted in"}
            />
            <Row
              label="Text messages"
              value={submission.smsOptIn ? "Opted in" : "Not opted in"}
            />
          </dl>
        </section>

        <section className="border-ink/12 bg-bone mt-6 rounded-2xl border p-6 sm:p-8">
          <h2 className="font-display text-xl">How they arrived</h2>
          <p className="text-ink/65 mt-2 text-[0.875rem] leading-relaxed">
            Captured from the request. Useful for spotting bots and for knowing
            which campaign produced a signup.
          </p>

          {meta ? (
            <dl className="border-ink/10 mt-5 border-t">
              <Row label="Source" value={describeSource(meta)} />
              <Row label="Landing page" value={meta.page} />
              <Row label="Referrer" value={meta.referrer} />
              <Row label="Campaign" value={meta.utmCampaign} />
              <Row label="Medium" value={meta.utmMedium} />
              <Row label="Device" value={meta.device} />
              <Row label="Browser" value={meta.browser} />
              <Row label="Operating system" value={meta.os} />
              <Row label="IP address" value={meta.ip} />
              <Row label="Country" value={meta.country} />
            </dl>
          ) : (
            <p className="text-ink/65 mt-5 text-[0.9375rem]">
              Nothing recorded. This submission predates request logging.
            </p>
          )}

          {meta?.userAgent ? (
            <details className="mt-5">
              <summary className="text-ink/65 cursor-pointer text-[0.875rem]">
                Raw user agent
              </summary>
              <p className="bg-ink/[0.04] text-ink/70 mt-3 rounded-xl px-4 py-3 font-mono text-[0.75rem] leading-relaxed break-all">
                {meta.userAgent}
              </p>
            </details>
          ) : null}
        </section>
      </div>

      {/* Working the record */}
      <div className="lg:col-span-5">
        <section className="border-ink/12 bg-bone rounded-2xl border p-6 sm:p-8">
          <h2 className="font-display text-xl">Pipeline</h2>

          <div className="mt-5">
            <label htmlFor="sub-status" className="label-xs text-ink/65">
              Status
            </label>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={saving}
                  aria-pressed={status === option}
                  onClick={() => changeStatus(option)}
                  className={`rounded-xl border px-3 py-2.5 text-[0.875rem] transition-colors duration-200 disabled:opacity-60 ${
                    status === option
                      ? "border-ink bg-ink text-bone"
                      : "border-ink/15 bg-bone-soft hover:border-ink/35"
                  }`}
                >
                  {STATUS_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7">
            <label htmlFor="sub-notes" className="label-xs text-ink/65">
              Internal notes
            </label>
            <p className="text-ink/65 mt-1.5 text-[0.8125rem] leading-relaxed">
              Only visible here. Never sent to anyone.
            </p>
            <textarea
              id="sub-notes"
              rows={7}
              value={notes}
              disabled={saving}
              onChange={(event) => {
                setNotes(event.target.value);
                setSaved(false);
              }}
              placeholder="Called Thursday, available for the May date, wants to open."
              className="border-ink/15 bg-bone-soft placeholder:text-ink/50 hover:border-ink/30 mt-3 w-full resize-y rounded-xl border px-4 py-3 text-[0.9375rem]"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={saving}
                onClick={() => patch({ notes })}
              >
                {saving ? <Spinner /> : null}
                {saving ? "Saving…" : "Save notes"}
              </Button>
              {saved ? (
                <span role="status" className="text-cobalt text-[0.8125rem]">
                  Saved.
                </span>
              ) : null}
              {error ? (
                <span
                  role="alert"
                  className="text-terracotta-deep text-[0.8125rem]"
                >
                  {error}
                </span>
              ) : null}
            </div>
          </div>

          <div className="border-ink/10 mt-8 border-t pt-6">
            <a
              href={`mailto:${submission.email}`}
              className="bg-ink text-bone hover:bg-cobalt inline-flex rounded-full px-5 py-3 text-[0.9375rem] transition-colors duration-200"
            >
              Email {submission.name.split(" ")[0] || "them"}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

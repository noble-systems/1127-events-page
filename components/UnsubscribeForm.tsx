"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormAlert, Spinner } from "@/components/forms/Fields";

export function UnsubscribeForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const confirm = async () => {
    setStatus("busy");
    setMessage(null);

    try {
      const response = await fetch(
        `/api/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        setMessage(data?.message ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("done");
    } catch {
      setMessage("Couldn't reach the server. Please try again.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div role="status" className="animate-rise">
        <h1 className="text-[2.4rem] leading-[1.05] sm:text-5xl">
          You&apos;re unsubscribed.
        </h1>
        <p className="text-ink/70 mt-5 text-[1.0625rem] leading-relaxed">
          We&apos;ve removed <strong className="font-medium">{email}</strong> from
          the list. You won&apos;t hear from us again unless you sign up another
          time.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/"
            className="bg-ink text-bone hover:bg-cobalt rounded-full px-5 py-3 text-[0.9375rem] transition-colors duration-200"
          >
            Back to 1127 Events
          </Link>
          <Link
            href="/rsvp"
            className="border-ink/20 hover:border-ink/45 rounded-full border px-5 py-3 text-[0.9375rem] transition-colors duration-200"
          >
            Changed your mind?
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[2.4rem] leading-[1.05] sm:text-5xl">
        Unsubscribe from 1127 emails
      </h1>
      <p className="text-ink/70 mt-5 text-[1.0625rem] leading-relaxed">
        This removes <strong className="font-medium">{email}</strong> from the 1127 Events list. We&apos;ll stop emailing you about upcoming dates.
      </p>

      {status === "error" && message ? (
        <div className="mt-6">
          <FormAlert message={message} />
        </div>
      ) : null}

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={status === "busy"}
          onClick={confirm}
        >
          {status === "busy" ? <Spinner /> : null}
          {status === "busy" ? "Removing…" : "Confirm unsubscribe"}
        </Button>
        <Link
          href="/"
          className="border-ink/20 hover:border-ink/45 rounded-full border px-5 py-3 text-[0.9375rem] transition-colors duration-200"
        >
          Keep me on the list
        </Link>
      </div>
    </div>
  );
}

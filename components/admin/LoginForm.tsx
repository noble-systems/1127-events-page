"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Field, FormAlert, Spinner, TextInput } from "@/components/forms/Fields";
import { Button } from "@/components/ui/Button";

/**
 * Two-step passwordless sign-in: email, then the code that arrives.
 *
 * There is no password field, and deliberately no "remember me" either. The
 * session cookie already lasts eight hours, which is a working day.
 */
type Stage =
  { kind: "email" } | { kind: "code"; session: string; destination?: string };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const post = async (body: Record<string, string>) => {
    const response = await fetch("/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      stage?: string;
      session?: string;
      destination?: string;
      retryable?: boolean;
    } | null;
    return { response, data };
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (stage.kind === "email" && !email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (stage.kind === "code" && code.trim().length < 6) {
      setError("Enter the six-digit code from your email.");
      return;
    }

    setBusy(true);

    try {
      if (stage.kind === "email") {
        const { response, data } = await post({ email });

        if (!response.ok || !data?.ok) {
          setError(data?.message ?? "Couldn't send a code. Please try again.");
          setBusy(false);
          return;
        }

        setStage({
          kind: "code",
          session: data.session ?? "",
          destination: data.destination,
        });
        setBusy(false);
        // Move focus to the code field so the flow continues without a click.
        requestAnimationFrame(() => codeInput.current?.focus());
        return;
      }

      const { response, data } = await post({
        email,
        code,
        session: stage.session,
      });

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "That code didn't work.");
        // A dead session means retyping the same digits is pointless. Clear the
        // code but STAY on this step, so "Send a new code" is one click away.
        // Dropping back to the email step would make them retype their address
        // to recover from something that was not their mistake.
        if (data?.retryable === false) setCode("");
        setBusy(false);
        return;
      }

      router.replace(next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  };

  /**
   * Sends a fresh code and swaps the held session for the new one.
   *
   * This matters more than it looks. Every code request invalidates the previous
   * code, so if someone asks twice and then types the digits from the first
   * email, Cognito rejects them and the only visible symptom is "the code does
   * not work". Resending in place keeps the session and the newest email in
   * step, and the notice below says which email to use.
   */
  const resend = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { response, data } = await post({ email });
      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "Couldn't send a new code.");
        return;
      }
      setStage({
        kind: "code",
        session: data.session ?? "",
        destination: data.destination,
      });
      setCode("");
      setNotice(
        "New code sent. Use the most recent email: the older code no longer works.",
      );
      requestAnimationFrame(() => codeInput.current?.focus());
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const useDifferentEmail = () => {
    setStage({ kind: "email" });
    setCode("");
    setError(null);
    setNotice(null);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <FormAlert message={error} /> : null}

      {notice ? (
        <p
          role="status"
          className="border-cobalt/25 bg-cobalt/[0.06] text-ink/80 rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed"
        >
          {notice}
        </p>
      ) : null}

      {stage.kind === "code" ? (
        <p className="border-ink/15 bg-sand/60 text-ink/75 rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed">
          We sent a six-digit code to{" "}
          <strong className="font-medium">
            {stage.destination ?? "your email"}
          </strong>
          . It is good for 15 minutes. If you request another, only the newest one
          works.
        </p>
      ) : null}

      <Field id="admin-email" label="Email">
        <TextInput
          id="admin-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@1127.events"
          value={email}
          disabled={busy || stage.kind === "code"}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      {stage.kind === "code" ? (
        <Field
          id="admin-code"
          label="Code"
          hint="Six digits, from the email we just sent."
        >
          <TextInput
            id="admin-code"
            ref={codeInput}
            name="code"
            type="text"
            inputMode="numeric"
            // Lets the browser and iOS offer the code straight from the message.
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="123456"
            value={code}
            disabled={busy}
            onChange={(event) =>
              // Cognito sends six digits today. Accepting eight costs nothing
              // and avoids silently truncating a longer code, which would
              // present as an unexplainable rejection.
              setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
          />
        </Field>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy}
        className="w-full"
      >
        {busy ? <Spinner /> : null}
        {busy
          ? stage.kind === "email"
            ? "Sending code…"
            : "Signing in…"
          : stage.kind === "email"
            ? "Email me a code"
            : "Sign in"}
      </Button>

      {stage.kind === "code" ? (
        <div className="flex flex-col gap-2 text-center">
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className="text-cobalt text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={useDifferentEmail}
            disabled={busy}
            className="text-ink/65 hover:text-ink text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
          >
            Use a different email
          </button>
        </div>
      ) : null}
    </form>
  );
}

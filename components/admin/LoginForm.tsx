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
        // A dead session means retyping the code is pointless: send them back
        // to request a fresh one rather than letting them guess at nothing.
        if (data?.retryable === false) {
          setStage({ kind: "email" });
          setCode("");
        }
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

  const startOver = () => {
    setStage({ kind: "email" });
    setCode("");
    setError(null);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <FormAlert message={error} /> : null}

      {stage.kind === "code" ? (
        <p className="border-ink/15 bg-sand/60 text-ink/75 rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed">
          We sent a six-digit code to{" "}
          <strong className="font-medium">
            {stage.destination ?? "your email"}
          </strong>
          . It expires in a few minutes.
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
            maxLength={6}
            placeholder="123456"
            value={code}
            disabled={busy}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
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
        <button
          type="button"
          onClick={startOver}
          disabled={busy}
          className="text-ink/65 hover:text-ink w-full text-[0.8125rem] underline-offset-4 hover:underline disabled:opacity-50"
        >
          Use a different email, or send a new code
        </button>
      ) : null}
    </form>
  );
}

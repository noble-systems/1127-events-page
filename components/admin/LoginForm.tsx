"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormAlert, Spinner, TextInput } from "@/components/forms/Fields";
import { Button } from "@/components/ui/Button";

type Stage = { kind: "credentials" } | { kind: "new-password"; session: string };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (stage.kind === "new-password") {
      if (newPassword !== confirm) {
        setError("Those passwords don't match.");
        return;
      }
      if (newPassword.length < 12) {
        setError("Use at least 12 characters.");
        return;
      }
    }

    setBusy(true);

    const body =
      stage.kind === "credentials"
        ? { email, password }
        : { email, newPassword, session: stage.session };

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        challenge?: string;
        session?: string;
      } | null;

      if (data?.challenge === "NEW_PASSWORD_REQUIRED" && data.session) {
        setStage({ kind: "new-password", session: data.session });
        setNotice(data.message ?? null);
        setBusy(false);
        return;
      }

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "Sign-in failed. Please try again.");
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

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <FormAlert message={error} /> : null}

      {notice && stage.kind === "new-password" ? (
        <p className="border-ink/15 bg-sand/60 text-ink/75 rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed">
          {notice}
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
          disabled={busy || stage.kind === "new-password"}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      {stage.kind === "credentials" ? (
        <Field id="admin-password" label="Password">
          <TextInput
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      ) : (
        <>
          <Field
            id="admin-new-password"
            label="New password"
            hint="At least 12 characters, with upper and lower case, a number and a symbol."
          >
            <TextInput
              id="admin-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              disabled={busy}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <Field id="admin-confirm" label="Confirm new password">
            <TextInput
              id="admin-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={busy}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        </>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy}
        className="w-full"
      >
        {busy ? <Spinner /> : null}
        {busy
          ? "Signing in…"
          : stage.kind === "new-password"
            ? "Set password and sign in"
            : "Sign in"}
      </Button>
    </form>
  );
}

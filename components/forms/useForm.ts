"use client";

import { useCallback, useRef, useState } from "react";
import {
  RULES,
  validate,
  type FormErrors,
  type FormType,
  type FormValues,
} from "@/lib/validation";

export type FormStatus = "idle" | "submitting" | "success" | "error";

/**
 * Small form controller shared by the RSVP, ambassador and partner forms.
 *
 * Fields validate on submit, then re-validate as you type once they've been
 * touched, so you get help without being nagged mid-keystroke.
 */
export function useForm(formType: FormType, initial: FormValues) {
  const initialRef = useRef(initial);
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>("idle");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setField = useCallback(
    (field: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [field]: value };
        if (submitAttempted) {
          setErrors(validate(RULES[formType], next));
        }
        return next;
      });
    },
    [formType, submitAttempted],
  );

  const reset = useCallback(() => {
    setValues(initialRef.current);
    setErrors({});
    setStatus("idle");
    setSubmitAttempted(false);
    setErrorMessage(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitAttempted(true);
      setErrorMessage(null);

      const nextErrors = validate(RULES[formType], values);
      setErrors(nextErrors);

      const firstInvalid = Object.keys(nextErrors)[0];
      if (firstInvalid) {
        setStatus("idle");
        const el = event.currentTarget.querySelector<HTMLElement>(
          `[name="${firstInvalid}"]`,
        );
        el?.focus();
        return;
      }

      setStatus("submitting");

      try {
        const response = await fetch("/api/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formType,
            values,
            // Lets the server attribute the signup to a campaign; it can't see
            // the page URL or the referrer on its own.
            context: {
              page:
                typeof window === "undefined"
                  ? undefined
                  : window.location.pathname + window.location.search,
              referrer:
                typeof document === "undefined" ? undefined : document.referrer,
            },
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          errors?: FormErrors;
          message?: string;
        } | null;

        if (!response.ok || !data?.ok) {
          if (data?.errors) setErrors(data.errors);
          setErrorMessage(
            data?.message ??
              "Something went wrong sending that. Please try again in a moment.",
          );
          setStatus("error");
          return;
        }

        setStatus("success");
      } catch {
        setErrorMessage(
          "We couldn't reach the server. Check your connection and try again.",
        );
        setStatus("error");
      }
    },
    [formType, values],
  );

  return {
    values,
    errors,
    status,
    errorMessage,
    submitAttempted,
    setField,
    reset,
    handleSubmit,
  };
}

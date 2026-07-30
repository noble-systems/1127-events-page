"use client";

import Link from "next/link";

import { useId } from "react";
import { smsProgram } from "@/content/site";
import type {
  ComponentPropsWithRef,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const CONTROL =
  "w-full rounded-xl border bg-bone-soft px-4 py-3 text-[0.95rem] text-ink " +
  "placeholder:text-ink/50 transition-colors duration-200 " +
  "hover:border-ink/30 disabled:opacity-60 disabled:cursor-not-allowed";

const CONTROL_OK = "border-ink/15";
const CONTROL_BAD = "border-terracotta bg-terracotta/[0.04]";

function controlClass(invalid?: boolean, extra = "") {
  return `${CONTROL} ${invalid ? CONTROL_BAD : CONTROL_OK} ${extra}`.trim();
}

export function Field({
  id,
  label,
  error,
  hint,
  optional,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="label-xs text-ink/70 mb-2.5 flex items-baseline gap-2"
      >
        {label}
        {optional ? (
          <span className="text-ink/65 tracking-normal normal-case">optional</span>
        ) : null}
      </label>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          className="text-terracotta-deep mt-2 flex items-start gap-1.5 text-[0.8125rem]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            fill="currentColor"
          >
            <path d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.7.7 0 0 0-.7.75l.2 3a.5.5 0 0 0 1 0l.2-3A.7.7 0 0 0 8 5.7Zm0 5.3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-ink/65 mt-2 text-[0.8125rem]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Described = { id: string; error?: string; hint?: string };

function describedBy({ id, error, hint }: Described) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

// ComponentPropsWithRef rather than InputHTMLAttributes so callers can pass a
// ref. React 19 treats ref as an ordinary prop on function components, so it
// arrives in `rest` and spreads straight onto the input with no forwardRef.
// The login form needs this to move focus to the code field.
export function TextInput({
  id,
  error,
  hint,
  ...rest
}: Described & ComponentPropsWithRef<"input">) {
  return (
    <input
      id={id}
      className={controlClass(Boolean(error))}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy({ id, error, hint })}
      {...rest}
    />
  );
}

export function TextArea({
  id,
  error,
  hint,
  rows = 5,
  ...rest
}: Described & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      id={id}
      rows={rows}
      className={controlClass(Boolean(error), "min-h-28 resize-y")}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy({ id, error, hint })}
      {...rest}
    />
  );
}

export function Select({
  id,
  error,
  hint,
  options,
  placeholder = "Select one",
  ...rest
}: Described & {
  options: readonly string[];
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        id={id}
        className={controlClass(Boolean(error), "appearance-none pr-11")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, error, hint })}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="text-ink/65 pointer-events-none absolute top-1/2 right-4 h-3.5 w-3.5 -translate-y-1/2"
      >
        <path
          d="M4 6.5 8 10.5l4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Bot trap, never shown, never announced, never tabbable. */
export function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  // Each form renders one of these, so the id has to be unique per instance.
  const id = useId();

  return (
    <div
      aria-hidden="true"
      className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
    >
      <label htmlFor={id}>Company website</label>
      <input
        id={id}
        name="companyWebsite"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Shared submit/success/error chrome for every form. */
export function FormAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="border-terracotta/35 bg-terracotta/[0.07] text-ink flex items-start gap-3 rounded-xl border px-4 py-3 text-[0.875rem]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="text-terracotta mt-0.5 h-4 w-4 shrink-0"
        fill="currentColor"
      >
        <path d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.7.7 0 0 0-.7.75l.2 3a.5.5 0 0 0 1 0l.2-3A.7.7 0 0 0 8 5.7Zm0 5.3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
      </svg>
      {message}
    </div>
  );
}

export function FormSuccess({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      role="status"
      className="animate-rise border-ink/12 bg-bone-soft rounded-2xl border p-8 text-center sm:p-10"
    >
      <span
        aria-hidden="true"
        className="bg-sun/25 text-sun-deep mx-auto flex h-12 w-12 items-center justify-center rounded-full"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6">
          <path
            d="m4.5 10.5 3.5 3.5 7.5-8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h3 className="mt-5 text-2xl">{title}</h3>
      <p className="text-ink/65 mx-auto mt-3 max-w-sm text-[0.9375rem] leading-relaxed">
        {body}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="text-cobalt mt-6 text-[0.875rem] font-medium underline-offset-4 hover:underline"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4 animate-spin"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The terms and privacy agreement, required on every form.
 *
 * This was previously copied verbatim into all four forms. That is a bad place
 * for duplication: it is consent wording, it is the thing a lawyer will ask to
 * change, and four copies means three chances to miss one. Same reasoning as
 * `smsProgram.disclosure` living in a single constant.
 */
export function TermsCheckbox({
  idPrefix,
  checked,
  onChange,
  error,
  disabled,
}: {
  idPrefix: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <CheckboxField
      id={`${idPrefix}-terms`}
      name="agreeTerms"
      checked={checked}
      disabled={disabled}
      error={error}
      onChange={onChange}
    >
      I agree to the{" "}
      <Link href="/terms" className="text-cobalt underline underline-offset-4">
        terms
      </Link>{" "}
      and the{" "}
      <Link href="/privacy" className="text-cobalt underline underline-offset-4">
        privacy policy
      </Link>
      .
    </CheckboxField>
  );
}

/**
 * The text-message disclosure, shown under every phone field.
 *
 * There is no tick box here by design: entering a number is the opt-in. That
 * puts the whole weight of consent on this sentence being read, so it sits
 * directly beneath the input rather than in fine print, and it renders whether
 * or not a number has been typed. Someone has to be able to see what giving
 * their number means before they decide to give it.
 */
export function SmsDisclosure() {
  return (
    <p className="border-ink/15 bg-bone-soft text-ink/70 rounded-xl border px-4 py-3.5 text-[0.8125rem] leading-relaxed">
      {smsProgram.disclosure}
    </p>
  );
}

/**
 * Consent checkbox. Never pre-checked: a ticked-by-default box is not consent,
 * and for the terms box it would also be worthless as evidence.
 */
export function CheckboxField({
  id,
  name,
  checked,
  onChange,
  error,
  disabled,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-200 ${
          error
            ? "border-terracotta bg-terracotta/[0.04]"
            : "border-ink/15 bg-bone-soft hover:border-ink/30"
        }`}
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="accent-cobalt mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="text-[0.875rem] leading-relaxed">{children}</span>
      </label>

      {error ? (
        <p
          id={`${id}-error`}
          className="text-terracotta-deep mt-2 text-[0.8125rem]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

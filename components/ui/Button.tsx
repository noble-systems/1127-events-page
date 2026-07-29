import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "sun" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "group relative inline-flex items-center justify-center gap-2.5 rounded-full font-medium text-center " +
  "transition-[background-color,color,border-color,transform,box-shadow] duration-300 ease-out " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0";

const VARIANTS: Record<ButtonVariant, string> = {
  // Solid ink, the workhorse on light surfaces
  primary: "bg-ink text-bone hover:bg-cobalt shadow-[0_1px_0_rgba(25,23,19,0.08)]",
  // Sun fill, the "book it" action, works on light and dark
  sun: "bg-sun text-ink hover:bg-sun-soft",
  // Hairline outline, inherits the surrounding text color
  outline:
    "border border-current/30 hover:border-current/70 hover:bg-current/[0.07]",
  // Transparent until hovered
  ghost: "hover:bg-current/[0.07]",
};

// min-h rather than h, so a long label wraps inside the button instead of
// overflowing it on narrow screens.
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 py-2 text-[0.8125rem] leading-snug tracking-[0.01em]",
  md: "min-h-11 px-5 py-2.5 text-[0.9375rem] leading-snug",
  lg: "min-h-13 px-6 py-3 text-base leading-snug sm:px-7",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant,
  size,
  className,
  children,
  type = "button",
  ...rest
}: Shared & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  href,
  ...rest
}: Shared & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");

  if (external) {
    return (
      <a
        href={href}
        className={buttonClass(variant, size, className)}
        rel="noreferrer noopener"
        target="_blank"
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** Small right-pointing arrow that nudges on hover. */
export function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-1 ${className}`}
    >
      <path
        d="M2.5 8h10.5M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

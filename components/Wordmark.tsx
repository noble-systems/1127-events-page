export function Wordmark({
  className = "",
  onDark = false,
  size = "md",
}: {
  className?: string;
  onDark?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <span className={`flex items-baseline gap-2.5 ${className}`}>
      <span
        className={`font-display leading-none font-semibold tracking-[-0.03em] ${
          size === "lg" ? "text-[2rem]" : "text-[1.45rem]"
        }`}
      >
        1127
      </span>
      <span
        aria-hidden="true"
        className={`w-px ${size === "lg" ? "h-5" : "h-3.5"} ${
          onDark ? "bg-current/40" : "bg-current/25"
        }`}
      />
      <span className="label-xs pt-px opacity-70">Events</span>
    </span>
  );
}

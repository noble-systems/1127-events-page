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
    <span className={`flex items-center gap-2.5 ${className}`}>
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
      {/* Centred against the numerals, not baseline-aligned. Baseline put a
          small-caps label at the very bottom of a line owned by much larger
          digits, which read as EVENTS sitting too low. The hairline nudge keeps
          optical centre, since caps carry no descenders. */}
      <span className="label-xs translate-y-[0.5px] opacity-70">Events</span>
    </span>
  );
}

import Image from "next/image";
import type { ReactNode } from "react";
import type { MediaTone } from "@/lib/types";

/**
 * Media
 * -----
 * One component handles both states of every image on the site:
 *
 *   • `src` set   → an optimized next/image at the same crop.
 *   • `src` null  → an on-brand designed placeholder whose caption doubles as
 *                   the shot note for the photo team.
 *
 * Placeholders are built from layered gradients, a geometric motif and film
 * grain so the page reads as a finished design rather than a wireframe.
 */

type MotifKind = "sun" | "ripple" | "arc" | "grid";

type ToneSpec = {
  background: string;
  motif: MotifKind;
  /** Motif color, chosen for the middle of the frame. */
  ink: "light" | "dark";
  /**
   * Caption color. Separate from `ink` because the caption sits at the bottom
   * of the frame, which is not always the same luminance as the middle ,
   * `golden`, for example, is cream at the top and dark terracotta at the base.
   */
  caption?: "light" | "dark";
};

const TONES: Record<MediaTone, ToneSpec> = {
  // Sun sits low and to the RIGHT so left-aligned copy always has a dark bed.
  dusk: {
    background: [
      "radial-gradient(15% 19% at 76% 77%, rgba(255,244,220,0.9) 0%, rgba(255,220,150,0.6) 46%, rgba(255,206,130,0) 82%)",
      "radial-gradient(64% 78% at 76% 78%, rgba(255,216,142,0.72) 0%, rgba(242,172,82,0.52) 26%, rgba(198,104,66,0.30) 50%, rgba(198,104,66,0) 76%)",
      "radial-gradient(85% 78% at 10% 4%, rgba(4,14,38,0.9) 0%, rgba(4,14,38,0) 66%)",
      "linear-gradient(158deg, #061229 0%, #0d2352 32%, #23365f 55%, #4d3b55 76%, #824c3a 92%, #a75e32 100%)",
    ].join(","),
    motif: "sun",
    ink: "light",
  },
  pool: {
    background: [
      "radial-gradient(58% 44% at 79% 7%, rgba(240,212,154,0.55) 0%, rgba(240,212,154,0) 70%)",
      "linear-gradient(170deg, #0f3b8f 0%, #1b63c4 48%, #4e9bd8 79%, #93c9e8 100%)",
    ].join(","),
    motif: "ripple",
    ink: "light",
  },
  cobalt: {
    background: [
      "radial-gradient(78% 58% at 22% 14%, rgba(63,99,228,0.85) 0%, rgba(63,99,228,0) 70%)",
      "linear-gradient(160deg, #10265c 0%, #1b3fcb 56%, #3f63e4 100%)",
    ].join(","),
    motif: "arc",
    ink: "light",
  },
  golden: {
    background: [
      "radial-gradient(16% 20% at 76% 26%, rgba(255,252,238,0.95) 0%, rgba(255,244,208,0) 84%)",
      "radial-gradient(88% 68% at 30% 18%, rgba(247,231,196,0.9) 0%, rgba(247,231,196,0) 70%)",
      "linear-gradient(200deg, #f0d49a 0%, #e0a63c 46%, #bf5b3c 100%)",
    ].join(","),
    motif: "sun",
    ink: "dark",
    caption: "light",
  },
  terracotta: {
    background: [
      "radial-gradient(84% 64% at 26% 16%, rgba(230,163,126,0.85) 0%, rgba(230,163,126,0) 72%)",
      "linear-gradient(155deg, #d98a63 0%, #bf5b3c 56%, #7a3421 100%)",
    ].join(","),
    motif: "arc",
    ink: "light",
  },
  ink: {
    background: [
      "radial-gradient(70% 54% at 74% 10%, rgba(232,176,72,0.40) 0%, rgba(232,176,72,0) 66%)",
      "radial-gradient(62% 52% at 8% 94%, rgba(41,86,220,0.36) 0%, rgba(41,86,220,0) 70%)",
      "linear-gradient(150deg, #38332c 0%, #221f1a 58%, #141210 100%)",
    ].join(","),
    motif: "grid",
    ink: "light",
  },
  sand: {
    background: [
      "radial-gradient(78% 58% at 74% 12%, rgba(247,231,196,0.95) 0%, rgba(247,231,196,0) 70%)",
      "linear-gradient(150deg, #fbf8f2 0%, #ece1cf 56%, #d8c6a8 100%)",
    ].join(","),
    motif: "grid",
    ink: "dark",
  },
};

/** The raw gradient stack for a tone, used for small accents and swatches. */
export function toneBackground(tone: MediaTone): string {
  return TONES[tone].background;
}

/* -------------------------------------------------------------------------- */
/* Motifs, low-contrast geometry that gives each placeholder structure        */
/* -------------------------------------------------------------------------- */

function Motif({ kind }: { kind: MotifKind }) {
  switch (kind) {
    case "sun":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMax slice"
          className="absolute inset-0 h-full w-full"
        >
          {/* The sun itself is painted by the tone gradient (soft edges);
              the motif only adds the rings and horizon around it. */}
          <g fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.17">
            <circle cx="298" cy="244" r="76" />
            <circle cx="298" cy="244" r="114" />
            <circle cx="298" cy="244" r="156" />
          </g>
          <line
            x1="0"
            y1="244"
            x2="400"
            y2="244"
            stroke="currentColor"
            strokeWidth="0.9"
            opacity="0.2"
          />
        </svg>
      );

    case "ripple":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 400 300"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.34">
            {[30, 72, 114, 156, 198, 240, 282].map((y, i) => (
              <path
                key={y}
                d={`M-10 ${y} C 60 ${y - 11 + (i % 2) * 6}, 120 ${y + 11}, 200 ${y} S 340 ${
                  y - 11
                }, 410 ${y}`}
              />
            ))}
          </g>
        </svg>
      );

    case "arc":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
        >
          <g fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.32">
            <path d="M-60 320 A 280 280 0 0 1 460 320" />
            <path d="M-10 320 A 220 220 0 0 1 410 320" />
            <path d="M50 320 A 160 160 0 0 1 350 320" />
            <path d="M110 320 A 100 100 0 0 1 290 320" />
          </g>
        </svg>
      );

    case "grid":
    default:
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 400 300"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <g stroke="currentColor" strokeWidth="0.8" opacity="0.24">
            {[50, 100, 150, 200, 250, 300, 350].map((x) => (
              <line key={x} x1={x} y1="0" x2={x} y2="300" />
            ))}
            <line x1="0" y1="196" x2="400" y2="196" />
            <line x1="0" y1="248" x2="400" y2="248" opacity="0.6" />
          </g>
        </svg>
      );
  }
}

/* -------------------------------------------------------------------------- */

const OVERLAYS = {
  none: null,
  soft: "linear-gradient(180deg, rgba(7,20,47,0.30) 0%, rgba(7,20,47,0.05) 40%, rgba(7,20,47,0.55) 100%)",
  // Left-side scrim protects the copy while letting the sun stay warm on the
  // right; the second layer darkens only the nav and meta strips.
  strong: [
    "linear-gradient(96deg, rgba(6,18,41,0.88) 0%, rgba(6,18,41,0.66) 32%, rgba(6,18,41,0.22) 64%, rgba(6,18,41,0) 100%)",
    "linear-gradient(180deg, rgba(6,18,41,0.58) 0%, rgba(6,18,41,0) 20%, rgba(6,18,41,0) 72%, rgba(6,18,41,0.58) 100%)",
  ].join(","),
} as const;

export type MediaProps = {
  tone: MediaTone;
  /** Description of the photograph that belongs in this slot. */
  shotNote?: string;
  src?: string | null;
  alt?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  overlay?: keyof typeof OVERLAYS;
  /** Hide the shot-note caption (e.g. behind the hero copy). */
  hideNote?: boolean;
  children?: ReactNode;
};

export function Media({
  tone,
  shotNote,
  src = null,
  alt = "",
  className = "",
  sizes = "(max-width: 768px) 100vw, 50vw",
  priority = false,
  overlay = "none",
  hideNote = false,
  children,
}: MediaProps) {
  const spec = TONES[tone];
  const overlayImage = OVERLAYS[overlay];
  const noteOnLight = (spec.caption ?? spec.ink) === "dark" && !src;

  return (
    <div
      className={`grain relative isolate overflow-hidden ${className}`}
      style={src ? undefined : { backgroundImage: spec.background }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${
            spec.ink === "light" ? "text-bone" : "text-ink"
          }`}
        >
          <Motif kind={spec.motif} />
          {/* Vignette keeps edges filmic without muddying the midtones */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(125% 105% at 50% 45%, rgba(7,20,47,0) 44%, rgba(7,20,47,0.20) 100%)",
            }}
          />
        </div>
      )}

      {overlayImage ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1]"
          style={{ backgroundImage: overlayImage }}
        />
      ) : null}

      {children ? <div className="relative z-[3] h-full">{children}</div> : null}

      {!src && shotNote && !hideNote ? (
        <div
          className={`absolute bottom-0 left-0 z-[3] flex max-w-[92%] items-center gap-2 p-3 sm:p-4 ${
            noteOnLight ? "text-ink/70" : "text-bone/80"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              noteOnLight ? "bg-ink/45" : "bg-bone/70"
            }`}
          />
          <span className="label-xs leading-relaxed">{shotNote}</span>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The door, on a phone.
 *
 * Tap Start scanning and the camera takes the WHOLE screen, because at a
 * dark doorway the phone is a scanner, not a webpage: viewfinder edge to
 * edge, verdict as a banner across the top in a color readable at arm's
 * length, running tally and the exit at the bottom, everything padded past
 * the iPhone notch and home bar. Scanning is continuous; the same code is
 * ignored for a few seconds so a steady hand does not double-fire, and the
 * phone buzzes differently for in versus stop.
 *
 * The camera is acquired in an effect AFTER the overlay renders, because the
 * video element only exists once the overlay does. A typed field on the idle
 * screen covers a broken camera and a guest whose phone died.
 */

type Verdict = {
  result: "checked-in" | "already-used" | "revoked" | "unknown";
  code?: string;
  tierName?: string;
  eventName?: string;
  email?: string | null;
  usedAt?: string | null;
};

const VERDICT_STYLE: Record<
  Verdict["result"],
  { bg: string; flash: string; label: string }
> = {
  // Real green, not brand cobalt: at a doorway green means go everywhere
  // on earth.
  "checked-in": {
    bg: "bg-[#15803d] text-bone",
    flash: "bg-[#22c55e]",
    label: "Checked in",
  },
  "already-used": { bg: "bg-sun text-ink", flash: "bg-sun", label: "ALREADY USED" },
  revoked: { bg: "bg-terracotta text-bone", flash: "bg-terracotta", label: "REVOKED" },
  unknown: { bg: "bg-ink text-bone", flash: "bg-ink", label: "Not a ticket" },
};

function phoenixClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  });
}

function VerdictCard({ verdict, count }: { verdict: Verdict; count?: number }) {
  const style = VERDICT_STYLE[verdict.result];
  return (
    <div className={`animate-door-pop rounded-2xl p-5 text-center shadow-lg ${style.bg}`}>
      <p className="text-3xl leading-tight font-semibold">
        {style.label}
        {verdict.result === "checked-in" && count ? (
          <span className="ml-2 opacity-70">#{count}</span>
        ) : null}
      </p>
      {verdict.result === "already-used" && verdict.usedAt ? (
        <p className="mt-0.5 text-lg">at {phoenixClock(verdict.usedAt)}</p>
      ) : null}
      {verdict.tierName ? <p className="mt-2 text-xl">{verdict.tierName}</p> : null}
      {verdict.email ? (
        <p className="mt-0.5 text-[0.9375rem] opacity-80">{verdict.email}</p>
      ) : null}
      {verdict.code ? (
        <p className="mt-1.5 font-mono text-[0.8125rem] tracking-wider opacity-70">
          {verdict.code}
        </p>
      ) : null}
    </div>
  );
}

export function DoorScanner({ prefill = "" }: { prefill?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [manual, setManual] = useState("");
  const [tally, setTally] = useState(0);
  /**
   * Bumps on every response, even two identical greens in a row: it keys
   * the flash and the card so both re-run their animations. Without it the
   * second of two clean check-ins changed nothing but a small code, and the
   * door guy could not tell the scan had landed.
   */
  const [seq, setSeq] = useState(0);
  /**
   * Web Audio needs a user gesture on iOS; the Start scanning tap unlocks
   * it. Created lazily and kept for the whole shift.
   */
  const audioRef = useRef<AudioContext | null>(null);

  const unlockAudio = () => {
    try {
      type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      void audioRef.current.resume();
    } catch {
      /* no sound is a shame, not a failure */
    }
  };

  /** A bright two-note ding for green; a low double buzz for everything else. */
  const play = (good: boolean) => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== "running") return;
    try {
      const note = (freq: number, at: number, length: number, type: OscillatorType) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + length + 0.05);
      };
      if (good) {
        note(880, 0, 0.12, "sine");
        note(1318.5, 0.1, 0.22, "sine");
      } else {
        note(220, 0, 0.15, "square");
        note(196, 0.18, 0.2, "square");
      }
    } catch {
      /* same shame */
    }
  };

  const submit = useCallback(async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const response = await fetch("/api/door/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as Verdict | null;
      const result = data?.result ?? "unknown";
      setVerdict({ ...data, result });
      setSeq((n) => n + 1);
      play(result === "checked-in");
      if (result === "checked-in") setTally((n) => n + 1);
      if (navigator.vibrate) {
        navigator.vibrate(result === "checked-in" ? 80 : [80, 60, 80]);
      }
    } catch {
      setVerdict({ result: "unknown" });
      setSeq((n) => n + 1);
    } finally {
      busyRef.current = false;
    }
  }, []);

  /** A code that arrived in the URL (native camera scan) checks in on load.
      The submit is async, so the state updates land after paint; the lint
      rule cannot see through the promise. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefill) void submit(prefill);
  }, [prefill, submit]);

  /**
   * The camera lives and dies with the overlay. Acquiring it here rather
   * than in the tap handler matters: the full-screen video element does not
   * exist until `scanning` renders it.
   */
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = () => {
          if (!streamRef.current) return;
          const canvas = canvasRef.current;
          if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              context.drawImage(video, 0, 0);
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
              const found = jsQR(pixels.data, pixels.width, pixels.height);
              if (found?.data) {
                const code =
                  found.data.match(/[?&]code=([A-Za-z0-9-]+)/)?.[1] ?? found.data;
                const now = Date.now();
                // One guest, one beep: the same code is quiet for 5 seconds.
                if (
                  code !== lastRef.current.code ||
                  now - lastRef.current.at > 5000
                ) {
                  lastRef.current = { code, at: now };
                  void submit(code);
                }
              }
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
           
          setScanning(false);
          setCameraError(
            "Camera didn't open. Allow camera access for this site in your browser settings, or type codes below.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [scanning, submit]);

  /* ---------------------------------------------------------------------- */
  /* Full-screen scanner                                                    */
  /* ---------------------------------------------------------------------- */
  if (scanning) {
    // z above everything, cookie banner included: nothing floats over the
    // doorway.
    return (
      <div className="bg-ink fixed inset-0 z-[999]">
        {/* The viewfinder IS the screen. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* The whole screen blinks the verdict color for half a second on
            every scan; keyed by seq so consecutive identical verdicts still
            blink. */}
        {verdict ? (
          <div
            key={seq}
            aria-hidden="true"
            className={`animate-door-flash pointer-events-none absolute inset-0 ${VERDICT_STYLE[verdict.result].flash}`}
          />
        ) : null}

        {/* Verdict banner, past the notch. */}
        <div
          className="absolute inset-x-0 top-0 p-4"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          {verdict ? (
            <VerdictCard key={seq} verdict={verdict} count={tally} />
          ) : (
            <p className="bg-ink/70 text-bone mx-auto w-fit rounded-full px-5 py-2.5 text-center text-[0.9375rem] backdrop-blur">
              Point at a ticket QR
            </p>
          )}
        </div>

        {/* Tally and the way out, above the home bar. */}
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 p-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <span className="bg-ink/70 text-bone rounded-full px-4 py-2.5 text-[0.9375rem] backdrop-blur">
            {tally} in
          </span>
          <button
            type="button"
            onClick={() => setScanning(false)}
            className="bg-bone text-ink rounded-full px-6 py-3 text-[1rem] font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Idle: start, last verdict, typed fallback                              */
  /* ---------------------------------------------------------------------- */
  return (
    <div className="mx-auto max-w-md">
      <Button
        onClick={() => {
          unlockAudio();
          setCameraError(null);
          setScanning(true);
        }}
        variant="primary"
        size="lg"
        className="w-full justify-center py-5 text-lg"
      >
        Start scanning
      </Button>
      {cameraError ? (
        <p className="text-terracotta-deep mt-3 text-center text-[0.875rem]">
          {cameraError}
        </p>
      ) : null}

      {verdict ? (
        <div className="mt-5">
          <VerdictCard key={seq} verdict={verdict} count={tally} />
        </div>
      ) : null}

      {tally > 0 ? (
        <p className="text-ink/65 mt-4 text-center text-[0.9375rem]">
          {tally} checked in this session.
        </p>
      ) : null}

      <form
        className="mt-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (manual.trim()) {
            void submit(manual.trim());
            setManual("");
          }
        }}
      >
        <input
          type="text"
          value={manual}
          placeholder="Or type a code: K7M-PQ2-9XT"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setManual(event.target.value.toUpperCase())}
          className="border-ink/20 bg-bone-soft min-w-0 flex-1 rounded-lg border px-3 py-3 font-mono text-[0.9375rem] tracking-wider uppercase"
        />
        <Button type="submit" variant="outline" size="md">
          Check
        </Button>
      </form>
    </div>
  );
}

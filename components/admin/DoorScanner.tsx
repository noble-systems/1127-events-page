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

const VERDICT_STYLE: Record<Verdict["result"], { bg: string; label: string }> = {
  "checked-in": { bg: "bg-cobalt text-bone", label: "Checked in" },
  "already-used": { bg: "bg-sun text-ink", label: "ALREADY USED" },
  revoked: { bg: "bg-terracotta text-bone", label: "REVOKED" },
  unknown: { bg: "bg-ink text-bone", label: "Not a ticket" },
};

function phoenixClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  });
}

function VerdictCard({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict.result];
  return (
    <div className={`rounded-2xl p-5 text-center shadow-lg ${style.bg}`}>
      <p className="text-3xl leading-tight font-semibold">{style.label}</p>
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
      if (result === "checked-in") setTally((n) => n + 1);
      if (navigator.vibrate) {
        navigator.vibrate(result === "checked-in" ? 80 : [80, 60, 80]);
      }
    } catch {
      setVerdict({ result: "unknown" });
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

        {/* Verdict banner, past the notch. */}
        <div
          className="absolute inset-x-0 top-0 p-4"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          {verdict ? (
            <VerdictCard verdict={verdict} />
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
          <VerdictCard verdict={verdict} />
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

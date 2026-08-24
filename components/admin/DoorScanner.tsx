"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The door, on a phone.
 *
 * Tap Start camera (iOS requires the gesture), point at the QR in the
 * guest's email, and the verdict fills the screen in a color legible from
 * arm's length at midnight: green in, amber already used, red not real.
 * Scanning continues hands-free; the same code is ignored for a few seconds
 * so one steady hand does not double-fire. A typed field covers a cracked
 * camera and a guest whose phone died (read the code off their email on
 * yours).
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
      const response = await fetch("/api/admin/door", {
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

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);

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
              const code = found.data.match(/[?&]code=([A-Za-z0-9-]+)/)?.[1] ?? found.data;
              const now = Date.now();
              // One guest, one beep: the same code is quiet for 5 seconds.
              if (code !== lastRef.current.code || now - lastRef.current.at > 5000) {
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
      setCameraError(
        "Camera didn't open. Allow camera access for this site in Settings, or type codes below.",
      );
    }
  };

  const style = verdict ? VERDICT_STYLE[verdict.result] : null;

  return (
    <div className="mx-auto max-w-md">
      {verdict && style ? (
        <div className={`rounded-2xl p-6 text-center ${style.bg}`}>
          <p className="text-3xl font-semibold">{style.label}</p>
          {verdict.result === "already-used" && verdict.usedAt ? (
            <p className="mt-1 text-lg">at {phoenixClock(verdict.usedAt)}</p>
          ) : null}
          {verdict.tierName ? (
            <p className="mt-3 text-xl">{verdict.tierName}</p>
          ) : null}
          {verdict.email ? (
            <p className="mt-1 text-[0.9375rem] opacity-80">{verdict.email}</p>
          ) : null}
          {verdict.code ? (
            <p className="mt-2 font-mono text-[0.8125rem] tracking-wider opacity-70">
              {verdict.code}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="border-ink/20 text-ink/55 rounded-2xl border border-dashed p-6 text-center text-[0.9375rem]">
          Verdicts land here: green in, amber already used, red no.
        </div>
      )}

      <div className="border-ink/15 mt-5 overflow-hidden rounded-2xl border">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full ${scanning ? "block" : "hidden"}`}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!scanning ? (
          <div className="p-6 text-center">
            <Button onClick={start} variant="primary" size="lg">
              Start camera
            </Button>
            {cameraError ? (
              <p className="text-terracotta-deep mt-3 text-[0.875rem]">
                {cameraError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5">
            <p className="text-ink/65 text-[0.875rem]">
              Scanning. {tally} in so far.
            </p>
            <button
              type="button"
              onClick={stop}
              className="text-ink/60 hover:text-ink text-[0.8125rem] underline underline-offset-2"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      <form
        className="mt-5 flex gap-2"
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
          className="border-ink/20 bg-bone-soft min-w-0 flex-1 rounded-lg border px-3 py-2.5 font-mono text-[0.9375rem] tracking-wider uppercase"
        />
        <Button type="submit" variant="outline" size="md">
          Check
        </Button>
      </form>
    </div>
  );
}

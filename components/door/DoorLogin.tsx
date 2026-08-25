"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Two ways through the same door: type the PIN, or scan the sign-in QR off
 * the admin's screen with the camera right here, because handing a phone
 * back and forth to open its native camera app was one step too many at
 * call time. A scanned code only counts if it is OUR sign-in URL on OUR
 * origin; any other QR reads as "not a sign-in code" rather than a
 * navigation.
 */
export function DoorLogin() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const firedRef = useRef(false);

  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const login = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/door/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok) {
        setMessage(data?.message ?? "That didn't work. Try again.");
        setBusy(false);
        firedRef.current = false;
        return;
      }
      setScanning(false);
      router.refresh();
    } catch {
      setMessage("Couldn't reach the server. Check your connection.");
      setBusy(false);
      firedRef.current = false;
    }
  };

  /** Camera loop, alive only while the scan view is open. */
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
              if (found?.data && !firedRef.current) {
                // Only OUR sign-in URL counts; the PIN inside it is what the
                // login endpoint verifies.
                const scannedPin = found.data.match(
                  /\/api\/door\/login\?pin=([A-Za-z0-9-]+)/,
                )?.[1];
                if (scannedPin) {
                  firedRef.current = true;
                  void login(scannedPin);
                } else {
                  setMessage("That's not a sign-in code.");
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
          setMessage(
            "Camera didn't open. Allow camera access in your browser settings, or type the PIN.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // login is stable enough for this lifecycle; the loop only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  return (
    <div className="space-y-4">
      {scanning ? (
        <div className="border-ink/15 overflow-hidden rounded-2xl border">
          <video ref={videoRef} playsInline muted className="w-full" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex items-center justify-between px-4 py-2.5">
            <p className="text-ink/65 text-[0.875rem]">
              Point at the sign-in QR
            </p>
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="text-ink/60 hover:text-ink text-[0.8125rem] underline underline-offset-2"
            >
              Type the PIN instead
            </button>
          </div>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={busy}
            onClick={() => {
              setMessage(null);
              setScanning(true);
            }}
            className="w-full justify-center py-5 text-lg"
          >
            Scan sign-in QR
          </Button>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pin.trim()) void login(pin);
            }}
          >
            <input
              type="text"
              value={pin}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="or type: XXXX-XXXX"
              onChange={(event) => setPin(event.target.value.toUpperCase())}
              className="border-ink/20 bg-bone-soft w-full rounded-xl border px-4 py-4 text-center font-mono text-xl tracking-[0.18em] uppercase"
            />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              disabled={busy || !pin.trim()}
              className="w-full justify-center"
            >
              {busy ? "Checking…" : "Open the door"}
            </Button>
          </form>
        </>
      )}

      {message ? (
        <p role="alert" className="text-terracotta-deep text-center text-[0.875rem]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useEffect, useRef, useState } from "react";

// GS1 labels on devices are usually DataMatrix; rooms may use QR or GS1-128.
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]],
  [DecodeHintType.ASSUME_GS1, true],
]);

type Props = {
  /** Called once per distinct code; the same code is ignored for a few seconds. */
  onDecode: (text: string) => void;
  paused?: boolean;
};

/** Live camera preview that reads barcodes. Falls back to a message when no camera is available. */
export function BarcodeScanner({ onDecode, paused = false }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onDecode);
  const pausedRef = useRef(paused);
  const last = useRef<{ text: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callback.current = onDecode;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    // This effect owns the camera stream. Under React's development double-run, the first run is
    // cancelled before it touches the <video>, so two readers never fight over one element.
    let controls: IScannerControls | undefined;
    let stream: MediaStream | undefined;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(HINTS as Map<DecodeHintType, never>, { delayBetweenScanAttempts: 150 });

    (async () => {
      // With no camera API (for example plain http on a phone) this throws and the catch explains.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      controls = await reader.decodeFromStream(stream, element, (result) => {
        if (!result || pausedRef.current) return;
        const text = result.getText();
        const now = Date.now();
        if (last.current && last.current.text === text && now - last.current.at < 3000) return;
        last.current = { text, at: now };
        callback.current(text);
      });
      if (cancelled) controls.stop();
    })()
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(name === "NotAllowedError"
          ? "Camera permission was refused. Allow it in the browser, or type the code instead."
          : !navigator.mediaDevices?.getUserMedia
            ? "This browser cannot use the camera here. Type the code instead."
            : "No camera is available. Type the code instead.");
      });
    return () => {
      cancelled = true;
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <p role="status" className="bg-muted rounded-lg px-4 py-6 text-center text-sm">{error}</p>;
  return (
    <video
      ref={video}
      muted
      playsInline
      aria-label="Camera preview for scanning"
      data-testid="scanner-video"
      className="aspect-video w-full rounded-lg bg-black object-cover"
    />
  );
}

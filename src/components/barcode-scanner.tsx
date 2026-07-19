"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";

/** Compact camera barcode scanner. Calls onScan once per unique code. */
export function BarcodeScanner({
  onScan,
  active = true,
  className,
}: {
  onScan: (code: string) => void;
  active?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<string>("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);

      if (!("BarcodeDetector" in window)) return;

      // @ts-expect-error BarcodeDetector
      const detector = new BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a", "upc_e"],
      });

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          requestAnimationFrame(tick);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes?.[0]?.rawValue as string | undefined;
          if (raw && raw !== lastRef.current) {
            lastRef.current = raw;
            onScan(raw);
            setTimeout(() => {
              if (lastRef.current === raw) lastRef.current = "";
            }, 2000);
          }
        } catch {
          // keep scanning
        }
        if (videoRef.current?.srcObject) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera denied");
      setRunning(false);
    }
  }, [onScan]);

  useEffect(() => {
    setSupported("BarcodeDetector" in window);
  }, []);

  useEffect(() => {
    if (!active) stop();
    return () => stop();
  }, [active, stop]);

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full object-cover"
          muted
          playsInline
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {!running ? (
          <Button type="button" size="sm" onClick={() => void start()}>
            Start camera
          </Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={stop}>
            Stop
          </Button>
        )}
      </div>
      {supported === false ? (
        <p className="mt-1 text-xs text-[var(--warn)]">
          Camera barcode not supported here — type code or use Bluetooth scanner.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function ScanField({
  value,
  onChange,
  onResolved,
  placeholder = "Scan or type barcode / SKU / batch",
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved?: (result: {
    kind: string;
    sku?: Record<string, unknown>;
    batch?: Record<string, unknown>;
  }) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function lookup(code: string) {
    const c = code.trim();
    if (!c) return;
    onChange(c);
    setMsg("Looking up…");
    const res = await fetch(`/api/lookup/barcode?code=${encodeURIComponent(c)}`);
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error ?? "Lookup failed");
      return;
    }
    if (json.kind === "none") {
      setMsg("No match");
      onResolved?.(json);
      return;
    }
    setMsg(json.kind === "sku" ? `SKU ${json.sku.product_code}` : `Batch ${json.batch.batch_code}`);
    onResolved?.(json);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup(value);
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={() => void lookup(value)}>
          Find
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide cam" : "Cam"}
        </Button>
      </div>
      {open ? (
        <BarcodeScanner
          onScan={(code) => {
            void lookup(code);
          }}
        />
      ) : null}
      {msg ? <p className="text-xs text-[var(--ink-muted)]">{msg}</p> : null}
    </div>
  );
}

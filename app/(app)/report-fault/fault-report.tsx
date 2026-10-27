"use client";

import { OctagonX } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DisplayStatus } from "@/lib/rules/assetStatus";
import { lookupCode } from "../scan/actions";
import { reportFaultAction } from "./actions";

export type PickableDevice = { id: string; giai: string; modelName: string; roomName: string | null; display: DisplayStatus };

type Props = {
  devices: PickableDevice[];
  preselected: PickableDevice | null;
  reasons: readonly string[];
  departmentName: string | null;
};

/** Two taps: pick the device, then pick what is wrong. */
export function FaultReport({ devices, preselected, reasons, departmentName }: Props) {
  const [device, setDevice] = useState<PickableDevice | null>(preselected);
  const [other, setOther] = useState("");
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; alreadyReported: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function findByCode(text: string) {
    startTransition(async () => {
      const result = await lookupCode(text);
      if (result.kind === "error") return setMessage(result.message);
      if (result.kind === "room") return setMessage("That is a room label. Scan the device's label.");
      setMessage(null);
      setCamera(false);
      setDevice({ id: result.id, giai: result.giai, modelName: result.modelName, roomName: result.roomName, display: result.display });
    });
  }

  function report(reason: string) {
    if (!device) return;
    startTransition(async () => {
      const result = await reportFaultAction({ assetId: device.id, reason });
      if (!result.ok) return setMessage(result.message);
      setMessage(null);
      setDone({ number: result.number, alreadyReported: result.alreadyReported });
    });
  }

  function reset() {
    setDevice(null);
    setDone(null);
    setOther("");
    setCode("");
    setMessage(null);
  }

  if (done && device) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-red-50 p-5 text-red-950 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-50">
        <p className="flex items-center gap-2 text-lg font-semibold"><OctagonX aria-hidden className="size-5" /> Do not use this device</p>
        <p>
          {done.alreadyReported
            ? <>This fault was already reported as <strong className="font-mono">{done.number}</strong>. Clinical engineering has it.</>
            : <>Reported as <strong className="font-mono">{done.number}</strong>. Clinical engineering will collect and check it.</>}
        </p>
        <p className="text-sm">{device.modelName} · <span className="font-mono">{device.giai}</span></p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Report another</Button>
          <Link href="/find" className="inline-flex items-center px-2 text-sm underline underline-offset-4">Find a working one</Link>
        </div>
      </div>
    );
  }

  const shown = devices.filter((d) => !filter.trim() || `${d.modelName} ${d.giai} ${d.roomName}`.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      {!device ? (
        <section aria-label="Which device?" className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">1. Which device?</h2>

          <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (code.trim()) findByCode(code); }} className="flex flex-col gap-1.5">
            <Label htmlFor="device-code">Scan or type its code (GIAI)</Label>
            <div className="flex gap-2">
              <Input id="device-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
              <Button type="submit" variant="outline" disabled={pending || !code.trim()}>Find</Button>
              <Button type="button" variant="outline" onClick={() => setCamera((c) => !c)}>{camera ? "Close camera" : "Use camera"}</Button>
            </div>
          </form>
          {camera && <BarcodeScanner onDecode={findByCode} paused={pending} />}

          {devices.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="device-filter">Or pick from devices last seen in {departmentName}</Label>
                <Input id="device-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, code or room" />
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {shown.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => setDevice(d)}
                      className="hover:bg-muted flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left">
                      <span className="font-medium">{d.modelName}</span>
                      <span className="text-muted-foreground font-mono text-xs">{d.giai}</span>
                      <span className="flex w-full items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{d.roomName}</span>
                        <StatusBadge display={d.display} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section aria-label="Chosen device" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">{device.modelName}</p>
            <p className="text-muted-foreground font-mono text-sm">{device.giai}{device.roomName ? ` · ${device.roomName}` : ""}</p>
          </div>
          <Button variant="outline" onClick={() => setDevice(null)} disabled={pending}>Change device</Button>
        </section>
      )}

      {device && (
        <section aria-label="What is wrong?" className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">2. What is wrong?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {reasons.map((r) => (
              <Button key={r} variant="outline" className="h-auto justify-start py-3 text-base" disabled={pending} onClick={() => report(r)}>
                {r}
              </Button>
            ))}
          </div>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (other.trim()) report(other); }} className="flex flex-col gap-1.5">
            <Label htmlFor="other-reason">Something else</Label>
            <div className="flex gap-2">
              <Input id="other-reason" value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} />
              <Button type="submit" disabled={pending || !other.trim()}>Report</Button>
            </div>
          </form>
        </section>
      )}

      {message && <p className="text-destructive text-sm" data-error>{message}</p>}
      {pending && <p className="text-muted-foreground text-sm" aria-live="polite">Working…</p>}
    </div>
  );
}

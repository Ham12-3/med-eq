"use client";

import { CircleCheck, OctagonX } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ReasonList, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupCode, recordDeviceLocation, type ScannedDevice, type ScannedRoom } from "./actions";

type Step = "device" | "room" | "confirm" | "done";

export function ScanFlow() {
  const [step, setStep] = useState<Step>("device");
  const [device, setDevice] = useState<ScannedDevice | null>(null);
  const [room, setRoom] = useState<ScannedRoom | null>(null);
  const [typed, setTyped] = useState(false); // any code typed by hand makes the event "manual"
  const [message, setMessage] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCode(code: string, byHand: boolean) {
    if (step === "confirm" || step === "done") return;
    startTransition(async () => {
      const result = await lookupCode(code);
      if (result.kind === "error") return setMessage(result.message);
      if (step === "device") {
        if (result.kind === "room") return setMessage("That is a room label. Scan the device first.");
        setDevice(result);
        setTyped(byHand);
        setMessage(null);
        setStep("room");
      } else {
        if (result.kind === "device") return setMessage("That is a device label. Scan the room's label to record where it is.");
        setRoom(result);
        setTyped((t) => t || byHand);
        setMessage(null);
        setStep("confirm");
      }
    });
  }

  function confirm() {
    if (!device || !room) return;
    startTransition(async () => {
      const result = await recordDeviceLocation({ assetId: device.id, roomId: room.id, source: typed ? "manual" : "scan" });
      if (!result.ok) return setMessage(result.message);
      setSavedTo(result.roomName);
      setStep("done");
    });
  }

  function reset() {
    setStep("device");
    setDevice(null);
    setRoom(null);
    setTyped(false);
    setMessage(null);
    setSavedTo(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex gap-2 text-sm" aria-label="Steps">
        {(["Scan the device", "Scan the room", "Confirm"] as const).map((label, i) => {
          const current = ["device", "room", "confirm"].indexOf(step) === i;
          return (
            <li key={label} aria-current={current ? "step" : undefined}
              className={current ? "font-medium" : "text-muted-foreground"}>
              {i + 1}. {label}{i < 2 && <span className="text-muted-foreground"> → </span>}
            </li>
          );
        })}
      </ol>

      {device && <DeviceCard device={device} />}
      {room && step !== "done" && (
        <p className="rounded-lg border px-4 py-3 text-sm">
          Room: <strong>{room.name}</strong> <span className="text-muted-foreground">· {room.floorLabel}</span>
        </p>
      )}

      {(step === "device" || step === "room") && (
        <section aria-label={step === "device" ? "Scan the device" : "Scan the room"} className="flex flex-col gap-3">
          <BarcodeScanner onDecode={(text) => handleCode(text, false)} paused={pending} />
          <ManualEntry
            key={step}
            label={step === "device" ? "Or type the device code (GIAI)" : "Or type the room code (GLN)"}
            disabled={pending}
            onSubmit={(code) => handleCode(code, true)}
          />
          {step === "room" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Done, no move to record</Button>
            </div>
          )}
        </section>
      )}

      {step === "confirm" && device && room && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p>
            Record <strong>{device.giai}</strong> as now in <strong>{room.name}</strong>?
          </p>
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={pending}>Confirm location</Button>
            <Button variant="outline" onClick={() => { setRoom(null); setStep("room"); }} disabled={pending}>Scan a different room</Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:bg-emerald-950">
          <p>Saved. {device?.giai} is now recorded in <strong>{savedTo}</strong>.</p>
          <div><Button onClick={reset}>Scan another device</Button></div>
        </div>
      )}

      {message && <p role="alert" className="text-destructive text-sm">{message}</p>}
      {pending && <p className="text-muted-foreground text-sm" aria-live="polite">Checking…</p>}
    </div>
  );
}

function DeviceCard({ device }: { device: ScannedDevice }) {
  return (
    <section aria-label="Scanned device" className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{device.modelName}</p>
          <p className="font-mono text-sm">{device.giai}</p>
        </div>
        <StatusBadge display={device.display} />
      </div>
      {device.doNotUse ? (
        <div className="flex flex-col gap-2 rounded-md bg-red-50 px-3 py-2 text-red-950 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-50">
          <p className="flex items-center gap-2 font-semibold"><OctagonX aria-hidden className="size-5" /> Do not use this device</p>
          <ReasonList reasons={device.reasons} />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 font-semibold text-emerald-950 ring-1 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-50">
          <CircleCheck aria-hidden className="size-5" /> Safe to use
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        {device.roomName ? `Last seen in ${device.roomName} (${device.floorLabel}), ${device.seenAt}.` : "No location recorded yet."}{" "}
        <Link href={`/assets/${device.id}`} className="underline underline-offset-4">Open device</Link>
      </p>
    </section>
  );
}

function ManualEntry({ label, disabled, onSubmit }: { label: string; disabled: boolean; onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit(value);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <Label htmlFor="manual-code">{label}</Label>
      <div className="flex gap-2">
        <Input id="manual-code" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
        <Button type="submit" variant="outline" disabled={disabled || !value.trim()}>Look up</Button>
      </div>
    </form>
  );
}

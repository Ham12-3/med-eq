"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { selectClass, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RoomOption } from "@/lib/data/assets";
import type { LibraryDevice } from "@/lib/data/library";
import { checkOutBlockers, LIBRARY_STATE_TEXT } from "@/lib/rules/library";
import { checkInAction, checkOutAction, lookupLibraryDevice } from "./actions";

/** The library counter: scan or type a device, then check it out or in. */
export function LibraryDesk({ rooms }: { rooms: RoomOption[] }) {
  const [device, setDevice] = useState<LibraryDevice | null>(null);
  const [typed, setTyped] = useState(false);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [cleaned, setCleaned] = useState(false);
  const [charged, setCharged] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const destinations = rooms.filter((r) => !["equipment_library", "workshop"].includes(r.roomType));
  const floors = [...new Map(destinations.map((r) => [r.floorId, r.floorLabel])).entries()];

  function find(text: string, byHand: boolean) {
    startTransition(async () => {
      const result = await lookupLibraryDevice(text);
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setDevice(result.device);
      setTyped(byHand);
      setCamera(false);
      setCleaned(false);
      setCharged(false);
      setRoomId("");
      setMessage(null);
    });
  }

  function done(result: { ok: boolean; message: string }) {
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) { setDevice(null); setCode(""); }
  }

  const source = typed ? "manual" : "scan";
  const blockers = device ? checkOutBlockers({ state: device.state, doNotUse: device.doNotUse }) : [];

  return (
    <section aria-label="Check out or in" className="flex flex-col gap-4 rounded-lg border p-4">
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (code.trim()) find(code, true); }} className="flex flex-col gap-1.5">
        <Label htmlFor="library-code">Scan or type the device code (GIAI)</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="library-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className="max-w-xs font-mono" />
          <Button type="submit" variant="outline" disabled={pending || !code.trim()}>Find</Button>
          <Button type="button" variant="outline" onClick={() => setCamera((c) => !c)}>{camera ? "Close camera" : "Use camera"}</Button>
        </div>
      </form>
      {camera && <BarcodeScanner onDecode={(t) => find(t, false)} paused={pending} />}

      {device && (
        <div aria-label="Library device" role="region" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{device.modelName}</p>
              <p className="text-muted-foreground font-mono text-sm">{device.giai}</p>
              <p className="text-sm">
                <strong>{device.inWorkshop ? "In the workshop" : LIBRARY_STATE_TEXT[device.state]}</strong>
                {device.state === "out" && !device.inWorkshop && device.roomName && ` · ${device.roomName}${device.onLoanSince ? ` since ${device.onLoanSince}` : ""}`}
              </p>
            </div>
            <StatusBadge display={device.display} />
          </div>

          {device.state === "out" && !device.inWorkshop && (
            <div className="flex flex-col gap-2">
              <p className="font-medium">Check in</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} /> Cleaned</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={charged} onChange={(e) => setCharged(e.target.checked)} /> Charged</label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending} onClick={() => startTransition(async () => done(await checkInAction({ assetId: device.id, cleaned, charged, source })))}>
                  Check in
                </Button>
                <Link href={`/report-fault?asset=${device.id}`} className="inline-flex items-center px-2 text-sm underline underline-offset-4">Faulty? Report it</Link>
              </div>
            </div>
          )}

          {device.state === "needs_prep" && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => startTransition(async () => done(await checkInAction({ assetId: device.id, cleaned: true, charged: true, source })))}>
                Mark cleaned and charged
              </Button>
              <Link href={`/report-fault?asset=${device.id}`} className="inline-flex items-center px-2 text-sm underline underline-offset-4">Faulty? Report it</Link>
            </div>
          )}

          {!device.inWorkshop && device.state !== "out" && (
            <div className="flex flex-col gap-2">
              <p className="font-medium">Check out</p>
              {blockers.length > 0 ? (
                <ul className="text-destructive ml-5 list-disc text-sm">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="destination">Going to</Label>
                    <select id="destination" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`${selectClass} min-w-56`}>
                      <option value="" disabled>Choose the ward or room</option>
                      {floors.map(([floorId, label]) => (
                        <optgroup key={floorId} label={label}>
                          {destinations.filter((r) => r.floorId === floorId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <Button disabled={pending || !roomId} onClick={() => startTransition(async () => done(await checkOutAction({ assetId: device.id, roomId, source })))}>
                    Check out
                  </Button>
                </div>
              )}
            </div>
          )}

          {device.inWorkshop && <p className="text-muted-foreground text-sm">Clinical engineering has this device. It comes back to the library once it is fixed.</p>}
        </div>
      )}

      {message && (
        <p role={message.ok ? "status" : undefined} className={message.ok ? "text-sm text-emerald-800 dark:text-emerald-300" : "text-destructive text-sm"} data-error={message.ok ? undefined : true}>
          {message.text}
        </p>
      )}
    </section>
  );
}

"use client";

import { useActionState } from "react";
import { selectClass } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RoomOption } from "@/lib/data/assets";
import { HARM_LEVELS, HARM_TEXT, INCIDENT_STATUSES, INCIDENT_STATUS_TEXT, type IncidentRow } from "@/lib/incidents";
import { createIncidentAction, updateIncidentAction, type IncidentFormState } from "./actions";

const textareaClass =
  "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Feedback({ state }: { state: IncidentFormState }) {
  return (
    <>
      {state.message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p>}
      {state.error && <p className="text-destructive text-sm" data-error>{state.error}</p>}
    </>
  );
}

export function NewIncidentForm({ rooms, now }: { rooms: RoomOption[]; now: string }) {
  const [state, action, pending] = useActionState<IncidentFormState, FormData>(createIncidentAction, {});
  const floors = [...new Map(rooms.map((r) => [r.floorId, r.floorLabel])).entries()];
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occurredAt">When it happened (UK time)</Label>
          <Input id="occurredAt" name="occurredAt" type="datetime-local" max={now} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="harmLevel">Harm</Label>
          <select id="harmLevel" name="harmLevel" defaultValue="no_harm" className={selectClass}>
            {HARM_LEVELS.map((h) => <option key={h} value={h}>{HARM_TEXT[h]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="giai">Device code (GIAI), if a device was involved</Label>
          <Input id="giai" name="giai" className="font-mono" autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roomId">Where</Label>
          <select id="roomId" name="roomId" defaultValue="" className={selectClass}>
            <option value="">Not recorded</option>
            {floors.map(([floorId, label]) => (
              <optgroup key={floorId} label={label}>
                {rooms.filter((r) => r.floorId === floorId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">What happened</Label>
        <textarea id="description" name="description" required className={textareaClass}
          placeholder="Describe the event. Do not include patient names or identifiers." />
      </div>
      <div><Button type="submit" disabled={pending}>Log incident</Button></div>
      <Feedback state={state} />
    </form>
  );
}

export function UpdateIncidentForm({ incident }: { incident: IncidentRow }) {
  const [state, action, pending] = useActionState<IncidentFormState, FormData>(updateIncidentAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={incident.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={incident.status} className={selectClass}>
            {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{INCIDENT_STATUS_TEXT[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="harmLevel">Harm</Label>
          <select id="harmLevel" name="harmLevel" defaultValue={incident.harmLevel} className={selectClass}>
            {HARM_LEVELS.map((h) => <option key={h} value={h}>{HARM_TEXT[h]}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">MHRA Yellow Card</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="reportedToMhra" defaultChecked={incident.reportedToMhra} /> Reported to the MHRA through the Yellow Card scheme
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yellowCardRef">Yellow Card reference</Label>
            <Input id="yellowCardRef" name="yellowCardRef" defaultValue={incident.yellowCardRef ?? ""} className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportedToMhraOn">Date reported</Label>
            <Input id="reportedToMhraOn" name="reportedToMhraOn" type="date" defaultValue={incident.reportedToMhraOn ?? ""} />
          </div>
        </div>
      </fieldset>
      <div><Button type="submit" disabled={pending}>Save</Button></div>
      <Feedback state={state} />
    </form>
  );
}

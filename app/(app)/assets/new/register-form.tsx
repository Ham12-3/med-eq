"use client";

import { useActionState } from "react";
import { selectClass } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegisterOptions } from "@/lib/data/register";
import { registerDeviceAction, type RegisterFormState } from "./actions";

const ACQUISITION_TEXT = {
  purchased: "Purchased", leased: "Leased", manufacturer_loan: "Loan from the supplier", donated: "Donated",
} as const;

export function RegisterForm({ options, today }: { options: RegisterOptions; today: string }) {
  const [state, action, pending] = useActionState<RegisterFormState, FormData>(registerDeviceAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deviceModelId">Device model</Label>
          <select id="deviceModelId" name="deviceModelId" defaultValue="" required className={selectClass}>
            <option value="" disabled>Choose…</option>
            {options.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="serialNumber">Serial number</Label>
          <Input id="serialNumber" name="serialNumber" required autoComplete="off" className="font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerDepartmentId">Owning department</Label>
          <select id="ownerDepartmentId" name="ownerDepartmentId" defaultValue="" required className={selectClass}>
            <option value="" disabled>Choose…</option>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="giai">Device code (GIAI)</Label>
          <Input id="giai" name="giai" autoComplete="off" className="font-mono" aria-describedby="giai-help" />
          <p id="giai-help" className="text-muted-foreground text-xs">Leave blank to give it the model&rsquo;s next number.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acquisitionType">How it was acquired</Label>
          <select id="acquisitionType" name="acquisitionType" defaultValue="purchased" className={selectClass}>
            {Object.entries(ACQUISITION_TEXT).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchaseDate">Purchase or delivery date</Label>
          <Input id="purchaseDate" name="purchaseDate" type="date" max={today} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firmwareVersion">Firmware version, if it has one</Label>
          <Input id="firmwareVersion" name="firmwareVersion" autoComplete="off" className="font-mono" />
        </div>
      </div>
      <div><Button type="submit" disabled={pending}>Register and open acceptance job</Button></div>
      {state.error && <p className="text-destructive text-sm" data-error>{state.error}</p>}
    </form>
  );
}

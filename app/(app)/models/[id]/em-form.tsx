"use client";

import { useActionState } from "react";
import { selectClass } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateEmAction, type EmFormState } from "./actions";

// The Fennigkoh and Smith scales (PLAN.md section 4).
const FUNCTION: [number, string][] = [
  [10, "Life support"], [9, "Surgical and intensive care"], [8, "Therapy and treatment"],
  [7, "Surgical and intensive care monitoring"], [6, "Other physiological monitoring and diagnostics"],
  [5, "Analytical laboratory"], [4, "Laboratory accessories"], [3, "Computers and related"], [2, "Patient-related and other"],
];
const RISK: [number, string][] = [
  [5, "Death"], [4, "Patient or operator injury"], [3, "Inappropriate therapy or misdiagnosis"], [2, "Equipment damage"], [1, "No significant risk"],
];
const MAINTENANCE: [number, string][] = [
  [5, "Extensive"], [4, "Above average"], [3, "Average"], [2, "Below average"], [1, "Minimal"],
];

export function EmForm({ modelId, fn, risk, maintenance }: { modelId: string; fn: number; risk: number; maintenance: number }) {
  const [state, action, pending] = useActionState<EmFormState, FormData>(updateEmAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="modelId" value={modelId} />
      <Pick id="fn" label="Function" value={fn} options={FUNCTION} />
      <Pick id="risk" label="Physical risk" value={risk} options={RISK} />
      <Pick id="maintenance" label="Maintenance need" value={maintenance} options={MAINTENANCE} />
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>Save and re-score</Button>
        {state.message && <span role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{state.message}</span>}
        {state.error && <span className="text-destructive text-sm">{state.error}</span>}
      </div>
    </form>
  );
}

function Pick({ id, label, value, options }: { id: string; label: string; value: number; options: [number, string][] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={id} defaultValue={value} className={selectClass}>
        {options.map(([v, text]) => <option key={v} value={v}>{v}: {text}</option>)}
      </select>
    </div>
  );
}

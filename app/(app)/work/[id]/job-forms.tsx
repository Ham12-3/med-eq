"use client";

import { useActionState, type ReactNode } from "react";
import { selectClass } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Job } from "@/lib/data/workOrders";
import {
  addPartAction, assignJobAction, awaitingPartsAction, closeJobAction, saveInspectionAction, saveResultsAction,
  startJobAction, type FormState,
} from "./actions";

type ServerAction = (state: FormState, formData: FormData) => Promise<FormState>;

function useForm(action: ServerAction) {
  return useActionState<FormState, FormData>(action, {});
}

function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p>}
      {state.error && <p className="text-destructive text-sm" data-error>{state.error}</p>}
      {state.blockers && state.blockers.length > 0 && (
        <div className="text-destructive text-sm" data-error>
          <p className="font-medium">This job cannot close yet:</p>
          <ul className="ml-5 list-disc">{state.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
    </>
  );
}

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function JobForm({ jobId, action, children, className }: { jobId: string; action: ServerAction; children: (pending: boolean, state: FormState) => ReactNode; className?: string }) {
  const [state, formAction, pending] = useForm(action);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      <input type="hidden" name="jobId" value={jobId} />
      {children(pending, state)}
    </form>
  );
}

// ---------- header controls ----------

export function JobControls({ job, technicians }: { job: Job; technicians: { id: string; name: string }[] | null }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {job.status !== "in_progress" && (
        <JobForm jobId={job.id} action={startJobAction} className="flex flex-col gap-1">
          {(pending, state) => (<>
            <Button type="submit" disabled={pending}>{job.status === "awaiting_parts" ? "Resume job" : "Start job"}</Button>
            <Feedback state={state} />
          </>)}
        </JobForm>
      )}
      {job.status !== "awaiting_parts" && (
        <JobForm jobId={job.id} action={awaitingPartsAction} className="flex flex-col gap-1">
          {(pending, state) => (<>
            <Button type="submit" variant="outline" disabled={pending}>Awaiting parts</Button>
            <Feedback state={state} />
          </>)}
        </JobForm>
      )}
      {technicians && (
        <JobForm jobId={job.id} action={assignJobAction} className="flex flex-wrap items-center gap-2">
          {(pending, state) => (<>
            <Label htmlFor="assigneeId" className="sr-only">Assign to</Label>
            <select id="assigneeId" name="assigneeId" defaultValue={job.assigneeId ?? ""} className={`${selectClass} w-auto`}>
              <option value="" disabled>Assign to…</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Button type="submit" variant="outline" disabled={pending}>Assign</Button>
            <Feedback state={state} />
          </>)}
        </JobForm>
      )}
    </div>
  );
}

// ---------- 1 inspection and 3 calibration ----------

export function InspectionForm({ job }: { job: Job }) {
  const i = job.inspection;
  return (
    <JobForm jobId={job.id} action={saveInspectionAction}>
      {(pending, state) => (<>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clean" defaultChecked={i?.clean ?? false} /> The device is clean
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="decontaminated" defaultChecked={i?.decontaminated ?? false} /> The device has been decontaminated
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="controlSettings">Control settings as found</Label>
          <Input id="controlSettings" name="controlSettings" defaultValue={i?.controlSettings ?? ""} placeholder="For example: rate 100 mL/h, alarms on, volume 3" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Inspection notes (optional)</Label>
          <textarea id="notes" name="notes" defaultValue={i?.notes ?? ""} className={textareaClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="calibrationNotes">Calibration (step 3): what was calibrated or adjusted (optional)</Label>
          <textarea id="calibrationNotes" name="calibrationNotes" defaultValue={job.calibrationNotes ?? ""} className={textareaClass} />
        </div>
        <div><Button type="submit" variant="outline" disabled={pending}>Save inspection</Button></div>
        <Feedback state={state} />
      </>)}
    </JobForm>
  );
}

// ---------- 2 parts ----------

export function PartForm({ job }: { job: Job }) {
  return (
    <JobForm jobId={job.id} action={addPartAction} className="grid gap-3 sm:grid-cols-[1fr_2fr]">
      {(pending, state) => (<>
        <Field id="partNumber" label="Part number" />
        <Field id="description" label="Description" />
        <Field id="supplier" label="Supplier" />
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Field id="lotNumber" label="Lot number" required={false} />
          <Field id="quantity" label="Qty" type="number" defaultValue="1" />
        </div>
        <div className="sm:col-span-2"><Button type="submit" variant="outline" disabled={pending}>Add part</Button></div>
        <div className="sm:col-span-2"><Feedback state={state} /></div>
      </>)}
    </JobForm>
  );
}

function Field({ id, label, type = "text", required = true, defaultValue }: { id: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} required={required} defaultValue={defaultValue} min={type === "number" ? 1 : undefined} />
    </div>
  );
}

// ---------- 4 tests ----------

const GROUP_TEXT = { inspection: "Visual checks", electrical_safety: "Electrical safety (BS EN 62353)", performance: "Performance", calibration: "Calibration" } as const;

export function ResultsForm({ job }: { job: Job }) {
  const results = new Map(job.results.filter((r) => r.phase === "after").map((r) => [r.templateItemId, r]));
  const needsAnalyser = job.items.some((i) => i.requiresAnalyser);
  const lastAnalyser = job.results.find((r) => r.analyserAssetId)?.analyserAssetId ?? "";
  const groups = [...new Set(job.items.map((i) => i.group))];

  return (
    <JobForm jobId={job.id} action={saveResultsAction} className="flex flex-col gap-4">
      {(pending, state) => (<>
        {needsAnalyser && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="analyserAssetId">Test analyser used</Label>
            <select id="analyserAssetId" name="analyserAssetId" defaultValue={lastAnalyser} className={selectClass}>
              <option value="">Choose the analyser…</option>
              {job.analysers.map((a) => (
                <option key={a.id} value={a.id} disabled={a.doNotUse}>
                  {a.giai} · {a.name}{a.doNotUse ? " (not safe to use)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {groups.map((group) => (
          <fieldset key={group} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{GROUP_TEXT[group]}</legend>
            {job.items.filter((i) => i.group === group).map((item) => {
              const r = results.get(item.id);
              return (
                <div key={item.id} className="grid items-center gap-2 border-b pb-2 sm:grid-cols-[1fr_auto_8rem]" data-item={item.code}>
                  <div className="text-sm">
                    <span>{item.name}</span>{!item.required && <span className="text-muted-foreground"> (optional)</span>}
                    {item.kind === "measurement" && <span className="text-muted-foreground block text-xs">{limits(item.lower, item.upper, item.unit)}</span>}
                  </div>
                  {item.kind === "measurement" ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`m:${item.id}`} className="sr-only">{item.name} reading</Label>
                      <Input id={`m:${item.id}`} name={`m:${item.id}`} inputMode="decimal" defaultValue={r?.value ?? ""} className="w-28 font-mono" />
                      <span className="text-muted-foreground text-xs">{item.unit}</span>
                    </div>
                  ) : (
                    <div className="flex gap-3 text-sm" role="radiogroup" aria-label={item.name}>
                      {(["pass", "fail", ...(item.required ? [] : ["not_applicable"])] as const).map((o) => (
                        <label key={o} className="flex items-center gap-1">
                          <input type="radio" name={`c:${item.id}`} value={o} defaultChecked={r?.outcome === o} />
                          {o === "not_applicable" ? "N/A" : o === "pass" ? "Pass" : "Fail"}
                        </label>
                      ))}
                    </div>
                  )}
                  <span className={`text-sm font-medium ${r?.outcome === "fail" ? "text-destructive" : r?.outcome === "pass" ? "text-emerald-800 dark:text-emerald-300" : "text-muted-foreground"}`}>
                    {r ? (r.outcome === "not_applicable" ? "N/A" : r.outcome === "pass" ? "Pass" : "Fail") : "Not tested"}
                  </span>
                </div>
              );
            })}
          </fieldset>
        ))}
        <div><Button type="submit" disabled={pending}>Save results</Button></div>
        <Feedback state={state} />
      </>)}
    </JobForm>
  );
}

function limits(lower: number | null, upper: number | null, unit: string | null) {
  const u = unit ? ` ${unit}` : "";
  if (lower !== null && upper !== null) return `Limits ${lower} to ${upper}${u}`;
  if (upper !== null) return `Limit ≤ ${upper}${u}`;
  if (lower !== null) return `Limit ≥ ${lower}${u}`;
  return "";
}

// ---------- 5 return to use ----------

export function CloseForm({ job, blockers }: { job: Job; blockers: string[] }) {
  return (
    <JobForm jobId={job.id} action={closeJobAction}>
      {(pending, state) => (<>
        {job.type === "repair" && (
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 font-medium">Outcome</legend>
            <label className="flex items-center gap-2"><input type="radio" name="choice" value="" defaultChecked /> Repaired: return to use</label>
            <label className="flex items-center gap-2"><input type="radio" name="choice" value="no_fault_found" /> No fault found: return to use</label>
            <label className="flex items-center gap-2"><input type="radio" name="choice" value="beyond_economic_repair" /> Beyond economic repair: decommission</label>
          </fieldset>
        )}
        {blockers.length > 0 && !state.message && (
          <div className="text-sm">
            <p className="font-medium">Still to do before closing:</p>
            <ul className="text-muted-foreground ml-5 list-disc">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        <div><Button type="submit" disabled={pending}>Close job</Button></div>
        <Feedback state={state} />
      </>)}
    </JobForm>
  );
}

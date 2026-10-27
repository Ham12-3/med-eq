"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { selectClass } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createNoticeAction, type NoticeFormInput } from "../actions";

type Criterion = NoticeFormInput["criteria"][number];
const emptyCriterion = (): Criterion => ({ deviceModelId: "", serialFrom: "", serialTo: "", firmware: "" });

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function NoticeForm({ models, today }: { models: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<Criterion[]>([emptyCriterion()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(i: number, change: Partial<Criterion>) {
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...change } : c)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    startTransition(async () => {
      const result = await createNoticeAction({
        reference: text("reference"), source: text("source") as NoticeFormInput["source"], title: text("title"),
        description: text("description"), requiredAction: text("requiredAction"), issuedOn: text("issuedOn"),
        deadline: text("deadline"), quarantineRequired: f.get("quarantineRequired") === "on", criteria,
      });
      if (!result.ok) return setError(result.message);
      router.push(`/notices/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Text id="reference" label="Reference" placeholder="For example NatPSA/2026/007/MHRA" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source">Source</Label>
          <select id="source" name="source" defaultValue="fsn" className={selectClass}>
            <option value="natpsa">National Patient Safety Alert</option>
            <option value="mhra_dsi">MHRA Device Safety Information</option>
            <option value="fsn">Manufacturer Field Safety Notice</option>
          </select>
        </div>
      </div>
      <Text id="title" label="Title" />
      <Area id="description" label="What is wrong" />
      <Area id="requiredAction" label="Required action" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Text id="issuedOn" label="Issued on" type="date" defaultValue={today} />
        <Text id="deadline" label="Action by" type="date" />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="quarantineRequired" defaultChecked /> Affected devices must not be used until actioned
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Affected devices</legend>
        <p className="text-muted-foreground text-sm">
          Leave the serial range or firmware empty to include every device of that model. Ranges include both ends.
        </p>
        {criteria.map((c, i) => (
          <div key={i} className="grid gap-2 border-b pb-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end" data-criterion={i}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`model-${i}`}>Model</Label>
              <select id={`model-${i}`} value={c.deviceModelId} onChange={(e) => update(i, { deviceModelId: e.target.value })} className={selectClass}>
                <option value="" disabled>Choose a model</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <Small id={`from-${i}`} label="Serial from" value={c.serialFrom ?? ""} onChange={(v) => update(i, { serialFrom: v })} />
            <Small id={`to-${i}`} label="Serial to" value={c.serialTo ?? ""} onChange={(v) => update(i, { serialTo: v })} />
            <Small id={`fw-${i}`} label="Firmware (comma separated)" value={c.firmware} onChange={(v) => update(i, { firmware: v })} />
            <Button type="button" variant="outline" disabled={criteria.length === 1}
              onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <div><Button type="button" variant="outline" onClick={() => setCriteria((cs) => [...cs, emptyCriterion()])}>Add another model</Button></div>
      </fieldset>

      {error && <p className="text-destructive text-sm" data-error>{error}</p>}
      <div><Button type="submit" disabled={pending}>{pending ? "Matching devices…" : "Save and match devices"}</Button></div>
    </form>
  );
}

function Text({ id, label, type = "text", placeholder, defaultValue }: { id: string; label: string; type?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} placeholder={placeholder} defaultValue={defaultValue} required />
    </div>
  );
}

function Area({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} name={id} required className={textareaClass} />
    </div>
  );
}

function Small({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}

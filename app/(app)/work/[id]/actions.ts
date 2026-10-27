"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Action } from "@/lib/auth/permissions";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import type { CurrentUser } from "@/lib/auth/users";
import type { Tx } from "@/db/client";
import {
  addPart, assignJob, closeJob, JobError, markAwaitingParts, saveActionNotes, saveInspection, saveResults, startJob,
  type ResultEntry,
} from "@/lib/data/workOrders";
import { todayInLondon } from "@/lib/dates";
import { blockerText } from "@/lib/rules/workOrder";
import { OUTCOME_TEXT } from "@/components/job-bits";

export type FormState = { error?: string; message?: string; blockers?: string[] };

/** Runs a job write, turning rule failures into a message instead of an error page. */
async function run(action: Action, fn: (tx: Tx, user: CurrentUser) => Promise<string | FormState>): Promise<FormState> {
  try {
    const result = await authorizedWrite(action, fn);
    refresh();
    return typeof result === "string" ? { message: result } : result;
  } catch (error) {
    if (error instanceof JobError || error instanceof NotPermittedError || error instanceof NotSignedInError) {
      return { error: error.message };
    }
    throw error;
  }
}

const jobId = (formData: FormData) => String(formData.get("jobId") ?? "");

export async function startJobAction(_: FormState, formData: FormData) {
  return run("workorder.work", async (tx, user) => { await startJob(tx, jobId(formData), user); return "Job started."; });
}

export async function awaitingPartsAction(_: FormState, formData: FormData) {
  return run("workorder.work", async (tx, user) => { await markAwaitingParts(tx, jobId(formData), user); return "Marked as awaiting parts."; });
}

export async function assignJobAction(_: FormState, formData: FormData) {
  return run("workorder.assign", async (tx, user) => {
    await assignJob(tx, jobId(formData), user, String(formData.get("assigneeId") ?? ""));
    return "Job reassigned.";
  });
}

const Inspection = z.object({
  controlSettings: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
  calibrationNotes: z.string().trim().max(2000),
});

export async function saveInspectionAction(_: FormState, formData: FormData) {
  const input = Inspection.parse({
    controlSettings: formData.get("controlSettings") ?? "",
    notes: formData.get("notes") ?? "",
    calibrationNotes: formData.get("calibrationNotes") ?? "",
  });
  return run("workorder.work", async (tx, user) => {
    await saveInspection(tx, jobId(formData), user, {
      inspection: {
        clean: formData.get("clean") === "on",
        decontaminated: formData.get("decontaminated") === "on",
        controlSettings: input.controlSettings,
        ...(input.notes ? { notes: input.notes } : {}),
      },
      calibrationNotes: input.calibrationNotes || null,
    });
    return "Inspection saved.";
  });
}

export async function saveResultsAction(_: FormState, formData: FormData) {
  const entries: ResultEntry[] = [];
  for (const [key, raw] of formData.entries()) {
    const value = String(raw);
    if (key.startsWith("m:") && value.trim()) entries.push({ itemId: key.slice(2), kind: "measurement", value });
    if (key.startsWith("c:") && (value === "pass" || value === "fail" || value === "not_applicable")) {
      entries.push({ itemId: key.slice(2), kind: "check", outcome: value });
    }
  }
  if (entries.length === 0) return { error: "Enter at least one result." };
  const analyser = String(formData.get("analyserAssetId") ?? "") || null;
  return run("workorder.work", async (tx, user) => {
    await saveResults(tx, jobId(formData), user, entries, analyser);
    return `${entries.length} ${entries.length === 1 ? "result" : "results"} saved.`;
  });
}

const Part = z.object({
  partNumber: z.string().trim().min(1, "Enter the part number").max(60),
  description: z.string().trim().min(1, "Describe the part").max(200),
  supplier: z.string().trim().min(1, "Enter the supplier").max(120),
  lotNumber: z.string().trim().max(60),
  quantity: z.coerce.number().int().min(1).max(100),
});

export async function addPartAction(_: FormState, formData: FormData) {
  const parsed = Part.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return run("workorder.work", async (tx, user) => {
    await addPart(tx, jobId(formData), user, { ...parsed.data, lotNumber: parsed.data.lotNumber || null });
    return "Part recorded.";
  });
}

export async function saveActionNotesAction(_: FormState, formData: FormData) {
  const notes = String(formData.get("actionNotes") ?? "");
  if (!notes.trim()) return { error: "Describe the action taken." };
  return run("workorder.work", async (tx, user) => {
    await saveActionNotes(tx, jobId(formData), user, notes);
    return "Action saved.";
  });
}

export async function closeJobAction(_: FormState, formData: FormData) {
  const raw = formData.get("choice");
  const choice = raw === "no_fault_found" || raw === "beyond_economic_repair" ? raw : undefined;
  return run("workorder.work", async (tx, user) => {
    const result = await closeJob(tx, jobId(formData), user, { choice, today: todayInLondon() });
    if (!result.ok) return { blockers: result.blockers.map(blockerText) };
    return `Closed: ${OUTCOME_TEXT[result.outcome]}.${result.followUp ? ` Follow-up repair ${result.followUp} opened.` : ""}`;
  });
}

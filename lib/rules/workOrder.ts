// When a work order may close, and what closing it does. PLAN.md section 3.3, with one
// change: CLAUDE.md's rule that no job closes without every required test wins over
// 3.3's "no fault found" exception, so a no-fault-found repair still needs its tests.

import { addMonths, type IsoDate } from "@/lib/dates";

export type WorkOrderType = "ppm" | "repair" | "acceptance" | "recall";
export type WorkOrderStatus = "open" | "in_progress" | "awaiting_parts" | "completed" | "cancelled";
export type CloseOutcome = "returned_to_use" | "failed_quarantined" | "no_fault_found" | "beyond_economic_repair" | "actioned";
export type LifecycleStatus = "acceptance" | "in_service" | "under_repair" | "quarantined" | "decommissioned";

export const OPEN_STATUSES: WorkOrderStatus[] = ["open", "in_progress", "awaiting_parts"];

export type TemplateItem = {
  id: string;
  name: string;
  required: boolean;
  requiresAnalyser: boolean;
};

export type RecordedResult = {
  templateItemId: string;
  phase: "before" | "after";
  outcome: "pass" | "fail" | "not_applicable";
  analyserAssetId: string | null;
};

export type Inspection = { clean: boolean; decontaminated: boolean; controlSettings: string } | null;

export type CloseInput = {
  type: WorkOrderType;
  status: WorkOrderStatus;
  inspection: Inspection;
  items: TemplateItem[]; // the job's template version; empty when it has none
  results: RecordedResult[];
  /** Analysers that are themselves "Do not use", for example out of calibration. */
  unusableAnalyserIds: string[];
  /** What the technician chose, where there is a choice. */
  choice?: "no_fault_found" | "beyond_economic_repair";
  actionNotes?: string | null; // recall jobs
};

export type Blocker =
  | { code: "NOT_OPEN" }
  | { code: "INSPECTION_INCOMPLETE" }
  | { code: "MISSING_RESULT"; item: string }
  | { code: "NOT_APPLICABLE_ON_REQUIRED"; item: string }
  | { code: "MISSING_ANALYSER"; item: string }
  | { code: "ANALYSER_NOT_USABLE"; item: string }
  | { code: "REPAIR_STILL_FAILING"; item: string }
  | { code: "BAD_CHOICE" }
  | { code: "RECALL_ACTION_MISSING" };

export function blockerText(b: Blocker): string {
  switch (b.code) {
    case "NOT_OPEN": return "This job is already closed.";
    case "INSPECTION_INCOMPLETE": return "Complete the initial inspection: the device must be clean and decontaminated, and the control settings noted.";
    case "MISSING_RESULT": return `Record a result for "${b.item}".`;
    case "NOT_APPLICABLE_ON_REQUIRED": return `"${b.item}" is required, so it cannot be marked not applicable.`;
    case "MISSING_ANALYSER": return `Record which test analyser was used for "${b.item}".`;
    case "ANALYSER_NOT_USABLE": return `The analyser used for "${b.item}" is itself not safe to use. Retest with another analyser.`;
    case "REPAIR_STILL_FAILING": return `"${b.item}" still fails. Fix and retest, or close the repair as beyond economic repair.`;
    case "BAD_CHOICE": return "That outcome does not apply to this kind of job.";
    case "RECALL_ACTION_MISSING": return "Record the action taken for the safety notice.";
  }
}

const needsInspection = (type: WorkOrderType) => type !== "recall";

/** The "after" result for each template item, the one that counts for closing. */
function afterResults(results: RecordedResult[]) {
  return new Map(results.filter((r) => r.phase === "after").map((r) => [r.templateItemId, r]));
}

/** Everything stopping the job from closing. Empty means it may close. */
export function closeBlockers(input: CloseInput): Blocker[] {
  if (!OPEN_STATUSES.includes(input.status)) return [{ code: "NOT_OPEN" }];
  const blockers: Blocker[] = [];

  if (input.choice === "no_fault_found" && input.type !== "repair") blockers.push({ code: "BAD_CHOICE" });
  if (input.choice === "beyond_economic_repair" && input.type !== "repair") blockers.push({ code: "BAD_CHOICE" });

  if (needsInspection(input.type)) {
    const i = input.inspection;
    if (!i || !i.clean || !i.decontaminated || !i.controlSettings.trim()) blockers.push({ code: "INSPECTION_INCOMPLETE" });
  }

  const after = afterResults(input.results);
  const unusable = new Set(input.unusableAnalyserIds);
  for (const item of input.items) {
    const r = after.get(item.id);
    if (item.required) {
      if (!r) { blockers.push({ code: "MISSING_RESULT", item: item.name }); continue; }
      if (r.outcome === "not_applicable") { blockers.push({ code: "NOT_APPLICABLE_ON_REQUIRED", item: item.name }); continue; }
    }
    if (r && r.outcome !== "not_applicable" && item.requiresAnalyser) {
      if (!r.analyserAssetId) blockers.push({ code: "MISSING_ANALYSER", item: item.name });
      else if (unusable.has(r.analyserAssetId)) blockers.push({ code: "ANALYSER_NOT_USABLE", item: item.name });
    }
    // A repair exists to fix the device: it cannot close with a failing test unless written off.
    if (input.type === "repair" && item.required && r?.outcome === "fail" && input.choice !== "beyond_economic_repair") {
      blockers.push({ code: "REPAIR_STILL_FAILING", item: item.name });
    }
  }

  if (input.type === "recall" && !input.actionNotes?.trim()) blockers.push({ code: "RECALL_ACTION_MISSING" });
  return blockers;
}

/** Names of required items whose "after" result failed. */
export function failedItems(input: Pick<CloseInput, "items" | "results">): string[] {
  const after = afterResults(input.results);
  return input.items.filter((i) => i.required && after.get(i.id)?.outcome === "fail").map((i) => i.name);
}

export type CloseEffects = {
  outcome: CloseOutcome;
  lifecycle: LifecycleStatus;
  /** New PPM dates, or null to leave the schedule alone. */
  schedule: { lastDoneOn: IsoDate; nextDueOn: IsoDate } | null;
  /** Create the schedule (first acceptance) rather than update it. */
  createSchedule: boolean;
  deactivateSchedule: boolean;
  setAcceptedNow: boolean;
  setDecommissionedNow: boolean;
  /** Open a follow-up repair job with this fault reason. */
  followUpRepair: string | null;
  markMatchActioned: boolean;
};

export type EffectsInput = {
  type: WorkOrderType;
  choice?: "no_fault_found" | "beyond_economic_repair";
  failed: string[]; // failedItems()
  today: IsoDate;
  intervalMonths: number | null;
  hasSchedule: boolean;
  currentLifecycle: LifecycleStatus;
  /** Another repair job is still open on this device. */
  otherOpenRepair: boolean;
};

/** What closing does, once closeBlockers() is empty. PLAN.md Q3 for failed PPM. */
export function closeEffects(e: EffectsInput): CloseEffects {
  const none: CloseEffects = {
    outcome: "returned_to_use", lifecycle: e.currentLifecycle, schedule: null, createSchedule: false,
    deactivateSchedule: false, setAcceptedNow: false, setDecommissionedNow: false, followUpRepair: null,
    markMatchActioned: false,
  };
  const backInService: LifecycleStatus = e.otherOpenRepair ? e.currentLifecycle : "in_service";
  const nextPpm = e.intervalMonths ? { lastDoneOn: e.today, nextDueOn: addMonths(e.today, e.intervalMonths) } : null;
  const failure = e.failed.length > 0 ? `Failed ${e.type === "ppm" ? "PPM" : "acceptance"}: ${e.failed.join("; ")}` : null;

  switch (e.type) {
    case "ppm":
      if (failure) return { ...none, outcome: "failed_quarantined", lifecycle: "quarantined", followUpRepair: failure };
      return { ...none, lifecycle: backInService, schedule: nextPpm };
    case "acceptance":
      if (failure) return { ...none, outcome: "failed_quarantined", lifecycle: "quarantined", followUpRepair: failure };
      return { ...none, lifecycle: backInService, schedule: nextPpm, createSchedule: !e.hasSchedule && nextPpm !== null, setAcceptedNow: true };
    case "repair":
      if (e.choice === "beyond_economic_repair") {
        return { ...none, outcome: "beyond_economic_repair", lifecycle: "decommissioned", deactivateSchedule: true, setDecommissionedNow: true };
      }
      return { ...none, outcome: e.choice === "no_fault_found" ? "no_fault_found" : "returned_to_use", lifecycle: backInService };
    case "recall":
      return { ...none, outcome: "actioned", markMatchActioned: true };
  }
}

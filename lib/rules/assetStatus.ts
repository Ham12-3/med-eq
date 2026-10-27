// "Do not use" and display status. PLAN.md section 3.2.
// This is the reference version. The SQL function asset_status_on() mirrors it
// so lists can filter in the database; tests/db/status-parity.test.ts keeps them equal.

import type { IsoDate } from "@/lib/dates";
import { isDueSoon, isOverdue } from "./ppm";

export type LifecycleStatus = "acceptance" | "in_service" | "under_repair" | "quarantined" | "decommissioned";

export type StatusFacts = {
  lifecycleStatus: LifecycleStatus;
  inUse: boolean;
  /** Next due date of the active PPM schedule, if there is one. */
  nextDueOn: IsoDate | null;
  /** The most recent completed job with test results has a required item that failed. */
  latestTestFailed: boolean;
  /** Open matches on safety notices that require quarantine. */
  openNoticeMatches: number;
  /** An open repair job (a reported fault not yet resolved). */
  openFaultReport: boolean;
};

export const REASONS = ["NOT_IN_SERVICE", "PPM_OVERDUE", "FAILED_TEST", "SAFETY_NOTICE", "FAULT_REPORTED"] as const;
export type Reason = (typeof REASONS)[number];

export const DISPLAY_STATUSES = ["decommissioned", "recalled", "do_not_use", "due_soon", "in_use", "available"] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export const REASON_TEXT: Record<Reason, string> = {
  NOT_IN_SERVICE: "Not in service",
  PPM_OVERDUE: "PPM overdue",
  FAILED_TEST: "Failed safety or performance test",
  SAFETY_NOTICE: "Open safety notice",
  FAULT_REPORTED: "Fault reported",
};

export const DISPLAY_TEXT: Record<DisplayStatus, string> = {
  decommissioned: "Decommissioned",
  recalled: "Recalled",
  do_not_use: "Do not use",
  due_soon: "PPM due soon",
  in_use: "In use",
  available: "Available",
};

const NOT_IN_SERVICE: LifecycleStatus[] = ["acceptance", "under_repair", "quarantined", "decommissioned"];

export type AssetStatus = { doNotUse: boolean; reasons: Reason[]; display: DisplayStatus };

export function deriveAssetStatus(facts: StatusFacts, today: IsoDate): AssetStatus {
  const reasons: Reason[] = [];
  if (NOT_IN_SERVICE.includes(facts.lifecycleStatus)) reasons.push("NOT_IN_SERVICE");
  if (facts.nextDueOn && isOverdue(facts.nextDueOn, today)) reasons.push("PPM_OVERDUE");
  if (facts.latestTestFailed) reasons.push("FAILED_TEST");
  if (facts.openNoticeMatches > 0) reasons.push("SAFETY_NOTICE");
  if (facts.openFaultReport) reasons.push("FAULT_REPORTED");

  // First match wins. Decommissioned devices are shown as such, not as a live risk.
  let display: DisplayStatus;
  if (facts.lifecycleStatus === "decommissioned") display = "decommissioned";
  else if (facts.openNoticeMatches > 0) display = "recalled";
  else if (reasons.length > 0) display = "do_not_use";
  else if (facts.nextDueOn && isDueSoon(facts.nextDueOn, today)) display = "due_soon";
  else if (facts.inUse) display = "in_use";
  else display = "available";

  return { doNotUse: reasons.length > 0, reasons, display };
}

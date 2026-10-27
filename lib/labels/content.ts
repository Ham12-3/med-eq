// What goes on the label printed when a job closes. MHRA "return to use": a dated
// SERVICED label with the next due date. Jobs that leave the device out of use get a
// DO NOT USE label instead, so a quarantined device is marked as well as recorded.

import type { CloseOutcome, WorkOrderType } from "@/lib/rules/workOrder";

export type LabelJob = {
  number: string;
  type: WorkOrderType;
  status: string;
  outcome: CloseOutcome | null;
  completedOn: string | null; // YYYY-MM-DD, London
  technicianInitials: string | null;
  giai: string;
  modelName: string;
  nextDueOn: string | null; // active schedule only
};

export type LabelContent = {
  kind: "serviced" | "do_not_use";
  title: string;
  lines: [label: string, value: string][];
  giai: string;
};

/** The label for a closed job, or null if this job gets no label. */
export function labelContent(job: LabelJob): LabelContent | null {
  if (job.status !== "completed" || !job.outcome || !job.completedOn) return null;
  if (job.type === "recall") return null;

  const common: [string, string][] = [
    ["Asset", job.giai],
    ["Date", job.completedOn],
    ["By", job.technicianInitials ?? "?"],
    ["Job", job.number],
  ];

  switch (job.outcome) {
    case "returned_to_use":
    case "no_fault_found":
      return {
        kind: "serviced",
        title: "SERVICED",
        lines: [...common, ["Next due", job.nextDueOn ?? "Not scheduled"]],
        giai: job.giai,
      };
    case "failed_quarantined":
      return { kind: "do_not_use", title: "DO NOT USE", lines: [...common, ["Reason", "Failed test, quarantined"]], giai: job.giai };
    case "beyond_economic_repair":
      return { kind: "do_not_use", title: "DO NOT USE", lines: [...common, ["Reason", "Beyond repair, for disposal"]], giai: job.giai };
    case "actioned":
      return null;
  }
}

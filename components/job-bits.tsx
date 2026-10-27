import { cn } from "@/lib/utils";
import type { QueueRow } from "@/lib/data/workOrders";

const PRIORITY_STYLE: Record<QueueRow["priority"], string> = {
  critical: "bg-red-700 text-white",
  high: "bg-orange-100 text-orange-900 ring-1 ring-orange-300 dark:bg-orange-950 dark:text-orange-100",
  normal: "bg-muted text-foreground ring-1 ring-border",
  low: "text-muted-foreground ring-1 ring-border",
};

export function PriorityBadge({ priority }: { priority: QueueRow["priority"] }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium capitalize", PRIORITY_STYLE[priority])}>
      {priority}
    </span>
  );
}

export const TYPE_TEXT = { ppm: "PPM", repair: "Repair", acceptance: "Acceptance", recall: "Recall" } as const;

export const STATUS_TEXT = {
  open: "Not started",
  in_progress: "In progress",
  awaiting_parts: "Awaiting parts",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

export const OUTCOME_TEXT = {
  returned_to_use: "Returned to use",
  failed_quarantined: "Failed: device quarantined",
  no_fault_found: "No fault found",
  beyond_economic_repair: "Beyond economic repair",
  actioned: "Actioned",
} as const;

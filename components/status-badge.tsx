import { Ban, CircleAlert, CircleCheck, Clock, Hand, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISPLAY_TEXT, REASON_TEXT, type DisplayStatus, type Reason } from "@/lib/rules/assetStatus";

// Colour is never the only signal: every status has its own icon and words.
const STYLE: Record<DisplayStatus, { className: string; Icon: typeof Ban }> = {
  recalled: { className: "bg-red-700 text-white", Icon: CircleAlert },
  do_not_use: { className: "bg-red-100 text-red-900 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-100", Icon: Ban },
  due_soon: { className: "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-100", Icon: Clock },
  in_use: { className: "bg-sky-100 text-sky-900 ring-1 ring-sky-300 dark:bg-sky-950 dark:text-sky-100", Icon: Hand },
  available: { className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100", Icon: CircleCheck },
  decommissioned: { className: "bg-muted text-muted-foreground ring-1 ring-border", Icon: Archive },
};

export function StatusBadge({ display, className }: { display: DisplayStatus; className?: string }) {
  const { className: tone, Icon } = STYLE[display];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap", tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {DISPLAY_TEXT[display]}
    </span>
  );
}

export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <li key={r} className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-900 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-900">
          {REASON_TEXT[r]}
        </li>
      ))}
    </ul>
  );
}

/** Native select styled to match the shadcn input. Works in plain GET forms with no JavaScript. */
export const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

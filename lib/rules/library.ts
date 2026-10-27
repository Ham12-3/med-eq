// Equipment library rules. PLAN.md section 1 (library tasks) and M3 step 7.

import { daysBetween, type IsoDate } from "@/lib/dates";

/** Loans out longer than this are listed for chasing. */
export const LOAN_CHASE_DAYS = 14;

export type LastMovement = {
  direction: "check_out" | "check_in";
  cleaned: boolean | null;
  charged: boolean | null;
} | null;

export type LibraryState = "ready" | "needs_prep" | "out";

export const LIBRARY_STATE_TEXT: Record<LibraryState, string> = {
  ready: "Ready",
  needs_prep: "Needs cleaning or charging",
  out: "Out on loan",
};

/**
 * Ready means: physically in the library, and the last check-in recorded it as
 * cleaned and charged. Anything in the library without that record needs prep.
 */
export function libraryState(inLibrary: boolean, last: LastMovement): LibraryState {
  if (!inLibrary) return "out";
  return last?.direction === "check_in" && last.cleaned && last.charged ? "ready" : "needs_prep";
}

export type CheckOutFacts = { state: LibraryState; doNotUse: boolean };

export function checkOutBlockers(f: CheckOutFacts): string[] {
  const blockers: string[] = [];
  if (f.doNotUse) blockers.push("This device must not be used.");
  if (f.state === "out") blockers.push("It is not in the library. Check it in first.");
  if (f.state === "needs_prep") blockers.push("Mark it cleaned and charged before it goes out.");
  return blockers;
}

export function isLoanOverdue(outOn: IsoDate, today: IsoDate): boolean {
  return daysBetween(outOn, today) > LOAN_CHASE_DAYS;
}

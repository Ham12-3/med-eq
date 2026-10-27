import { addDays, addMonths, type IsoDate } from "@/lib/dates";

/** PPM jobs are created this many days before the due date; the same window is "due soon". */
export const DUE_SOON_DAYS = 14;

/** Next due date counts from the day the PPM was done, not the old due date (PLAN.md Q5). */
export function nextDueAfterCompletion(completedOn: IsoDate, intervalMonths: number): IsoDate {
  return addMonths(completedOn, intervalMonths);
}

/** Due on the day itself is still in date. */
export function isOverdue(nextDueOn: IsoDate, today: IsoDate): boolean {
  return today > nextDueOn;
}

export function isDueSoon(nextDueOn: IsoDate, today: IsoDate): boolean {
  return !isOverdue(nextDueOn, today) && addDays(nextDueOn, -DUE_SOON_DAYS) <= today;
}

/** True when the daily job should have an open PPM job for this schedule (due soon or overdue). */
export function needsPpmWorkOrder(nextDueOn: IsoDate, today: IsoDate): boolean {
  return addDays(nextDueOn, -DUE_SOON_DAYS) <= today;
}

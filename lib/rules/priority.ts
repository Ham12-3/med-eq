// Job priority. PLAN.md section 3.4.

export const PRIORITIES = ["critical", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

function raise(priority: Priority): Priority {
  return PRIORITIES[Math.max(0, PRIORITIES.indexOf(priority) - 1)];
}

/** EM 16+ high, 12-15 normal, under 12 low; an overdue PPM goes up one level. */
export function ppmPriority(emScore: number, overdue: boolean): Priority {
  const base: Priority = emScore >= 16 ? "high" : emScore >= 12 ? "normal" : "low";
  return overdue ? raise(base) : base;
}

/** Ward fault reports are high; a fault on life-support equipment is critical. */
export function repairPriority(category: string): Priority {
  return category === "life_support" ? "critical" : "high";
}

// Fennigkoh and Smith equipment management (EM) score. PLAN.md section 4.

/** EM at or above this puts a device model on scheduled PPM. */
export const SCHEDULED_PPM_THRESHOLD = 12;

export type EmParts = {
  function: number; // 2-10
  physicalRisk: number; // 1-5
  maintenance: number; // 1-5
  incidentHistory: number; // -2 to +2
};

function assertRange(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}, got ${value}`);
  }
}

export function emScore(parts: EmParts): number {
  assertRange("Function", parts.function, 2, 10);
  assertRange("Physical risk", parts.physicalRisk, 1, 5);
  assertRange("Maintenance need", parts.maintenance, 1, 5);
  assertRange("Incident history", parts.incidentHistory, -2, 2);
  return parts.function + parts.physicalRisk + parts.maintenance + parts.incidentHistory;
}

/**
 * Incident history from failures per asset per year over the last 24 months.
 * Bands use the average time between failures: under 6 months +2, 6-9 +1,
 * 9-18 0, 18-30 -1, over 30 months (or no failures) -2.
 */
export function incidentHistoryScore(failuresPerAssetYear: number): number {
  if (!(failuresPerAssetYear > 0)) return -2;
  const monthsBetweenFailures = 12 / failuresPerAssetYear;
  if (monthsBetweenFailures < 6) return 2;
  if (monthsBetweenFailures < 9) return 1;
  if (monthsBetweenFailures <= 18) return 0;
  if (monthsBetweenFailures <= 30) return -1;
  return -2;
}

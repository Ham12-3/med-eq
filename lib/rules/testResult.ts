/** Measurement outcomes come from the limits, never from the technician. Limits are inclusive. */
export function measurementOutcome(
  value: number,
  lowerLimit: number | null,
  upperLimit: number | null,
): "pass" | "fail" {
  if (!Number.isFinite(value)) throw new Error(`Measured value must be a number: ${value}`);
  if (lowerLimit === null && upperLimit === null) throw new Error("A measurement needs at least one limit");
  if (lowerLimit !== null && value < lowerLimit) return "fail";
  if (upperLimit !== null && value > upperLimit) return "fail";
  return "pass";
}

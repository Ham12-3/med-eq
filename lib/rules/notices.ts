// Which devices a safety notice affects. PLAN.md M4 step 2.
// A notice has one or more criteria: a device model, optionally a serial range and/or a list
// of firmware versions. A device matches if it matches any criterion.

export type NoticeCriterion = {
  deviceModelId: string;
  serialFrom: string | null; // inclusive
  serialTo: string | null; // inclusive
  firmwareVersions: string[] | null; // null or empty: any firmware
};

export type MatchableDevice = {
  deviceModelId: string;
  serialNumber: string;
  firmwareVersion: string | null;
};

/**
 * Natural order for serial numbers: runs of digits compare by value, everything else by
 * character, case-insensitively. So "SN-9" < "SN-10" and "VP2-0100099" < "VP2-0100100".
 */
export function compareSerials(a: string, b: string): number {
  const split = (s: string) => s.trim().toUpperCase().match(/\d+|\D+/g) ?? [];
  const pa = split(a);
  const pb = split(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    const xn = /^\d/.test(x);
    const yn = /^\d/.test(y);
    if (xn && yn) {
      const diff = BigInt(x) - BigInt(y);
      if (diff !== BigInt(0)) return diff < BigInt(0) ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return pa.length - pb.length;
}

export function serialInRange(serial: string, from: string | null, to: string | null): boolean {
  if (from && compareSerials(serial, from) < 0) return false;
  if (to && compareSerials(serial, to) > 0) return false;
  return true;
}

export function matchesCriterion(device: MatchableDevice, c: NoticeCriterion): boolean {
  if (device.deviceModelId !== c.deviceModelId) return false;
  if (!serialInRange(device.serialNumber, c.serialFrom, c.serialTo)) return false;
  if (c.firmwareVersions && c.firmwareVersions.length > 0) {
    if (!device.firmwareVersion) return false;
    if (!c.firmwareVersions.some((v) => v.trim() === device.firmwareVersion!.trim())) return false;
  }
  return true;
}

/** The first criterion a device matches, or null. */
export function matchingCriterion<C extends NoticeCriterion>(device: MatchableDevice, criteria: C[]): C | null {
  return criteria.find((c) => matchesCriterion(device, c)) ?? null;
}

/** Problems with a criterion before it is saved. */
export function criterionProblems(c: NoticeCriterion): string[] {
  const problems: string[] = [];
  if (c.serialFrom && c.serialTo && compareSerials(c.serialFrom, c.serialTo) > 0) {
    problems.push(`The serial range ${c.serialFrom} to ${c.serialTo} runs backwards.`);
  }
  return problems;
}

/** A notice can close once no matched device is still waiting for action. */
export function canCloseNotice(matchStatuses: ("open" | "actioned" | "not_affected")[]): boolean {
  return matchStatuses.every((s) => s !== "open");
}

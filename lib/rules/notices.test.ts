import { describe, expect, it } from "vitest";
import { canCloseNotice, compareSerials, criterionProblems, matchesCriterion, matchingCriterion, serialInRange, type NoticeCriterion } from "./notices";

const device = { deviceModelId: "pump", serialNumber: "VP2-0100150", firmwareVersion: "2.3.4" };
const criterion = (c: Partial<NoticeCriterion> = {}): NoticeCriterion => ({
  deviceModelId: "pump", serialFrom: null, serialTo: null, firmwareVersions: null, ...c,
});

describe("compareSerials", () => {
  it("compares runs of digits by value", () => {
    expect(compareSerials("SN-9", "SN-10")).toBeLessThan(0);
    expect(compareSerials("VP2-0100099", "VP2-0100100")).toBeLessThan(0);
    expect(compareSerials("VP2-0100100", "VP2-0100100")).toBe(0);
  });

  it("ignores case and surrounding spaces", () => {
    expect(compareSerials(" vp2-0100100 ", "VP2-0100100")).toBe(0);
  });

  it("puts a shorter serial with the same start first", () => {
    expect(compareSerials("SN-1", "SN-1A")).toBeLessThan(0);
  });

  it("copes with very long digit runs", () => {
    expect(compareSerials("X99999999999999999999", "X100000000000000000000")).toBeLessThan(0);
  });
});

describe("serialInRange", () => {
  it("includes both ends of the range", () => {
    expect(serialInRange("VP2-0100100", "VP2-0100100", "VP2-0100200")).toBe(true);
    expect(serialInRange("VP2-0100200", "VP2-0100100", "VP2-0100200")).toBe(true);
    expect(serialInRange("VP2-0100099", "VP2-0100100", "VP2-0100200")).toBe(false);
    expect(serialInRange("VP2-0100201", "VP2-0100100", "VP2-0100200")).toBe(false);
  });

  it("treats a missing end as open", () => {
    expect(serialInRange("VP2-0000001", null, "VP2-0100200")).toBe(true);
    expect(serialInRange("VP2-9999999", "VP2-0100100", null)).toBe(true);
    expect(serialInRange("anything", null, null)).toBe(true);
  });
});

describe("matchesCriterion", () => {
  it("needs the same model", () => {
    expect(matchesCriterion(device, criterion())).toBe(true);
    expect(matchesCriterion(device, criterion({ deviceModelId: "ventilator" }))).toBe(false);
  });

  it("checks the serial range and the firmware list together", () => {
    expect(matchesCriterion(device, criterion({ serialFrom: "VP2-0100100", serialTo: "VP2-0100200", firmwareVersions: ["2.3.4", "3.0.1"] }))).toBe(true);
    expect(matchesCriterion(device, criterion({ serialFrom: "VP2-0100100", firmwareVersions: ["3.0.1"] }))).toBe(false);
    expect(matchesCriterion(device, criterion({ serialTo: "VP2-0100149", firmwareVersions: ["2.3.4"] }))).toBe(false);
  });

  it("treats an empty firmware list as any firmware", () => {
    expect(matchesCriterion(device, criterion({ firmwareVersions: [] }))).toBe(true);
  });

  it("does not match a firmware-specific notice when the device's firmware is unknown", () => {
    expect(matchesCriterion({ ...device, firmwareVersion: null }, criterion({ firmwareVersions: ["2.3.4"] }))).toBe(false);
    expect(matchesCriterion({ ...device, firmwareVersion: null }, criterion())).toBe(true);
  });

  it("returns the first criterion that matches", () => {
    const a = criterion({ deviceModelId: "ventilator" });
    const b = criterion({ serialFrom: "VP2-0100000" });
    expect(matchingCriterion(device, [a, b])).toBe(b);
    expect(matchingCriterion(device, [a])).toBeNull();
  });
});

describe("notice housekeeping", () => {
  it("rejects a backwards serial range", () => {
    expect(criterionProblems(criterion({ serialFrom: "SN-20", serialTo: "SN-3" }))).toHaveLength(1);
    expect(criterionProblems(criterion({ serialFrom: "SN-3", serialTo: "SN-20" }))).toEqual([]);
  });

  it("closes only when nothing is still waiting", () => {
    expect(canCloseNotice(["actioned", "not_affected"])).toBe(true);
    expect(canCloseNotice([])).toBe(true);
    expect(canCloseNotice(["actioned", "open"])).toBe(false);
  });
});

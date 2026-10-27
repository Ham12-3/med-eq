import { describe, expect, it } from "vitest";
import { deriveAssetStatus, type StatusFacts } from "./assetStatus";

const TODAY = "2026-10-27";
const healthy: StatusFacts = {
  lifecycleStatus: "in_service",
  inUse: false,
  nextDueOn: "2027-03-01",
  latestTestFailed: false,
  openNoticeMatches: 0,
  openFaultReport: false,
};
const status = (changes: Partial<StatusFacts>) => deriveAssetStatus({ ...healthy, ...changes }, TODAY);

describe("deriveAssetStatus", () => {
  it("shows a healthy, free device as available", () => {
    expect(status({})).toEqual({ doNotUse: false, reasons: [], display: "available" });
  });

  it("shows in use, then due soon, without making the device unsafe", () => {
    expect(status({ inUse: true }).display).toBe("in_use");
    expect(status({ inUse: true, nextDueOn: "2026-11-05" })).toEqual({ doNotUse: false, reasons: [], display: "due_soon" });
  });

  it("is still in date on the due day, and overdue the day after", () => {
    expect(status({ nextDueOn: TODAY }).doNotUse).toBe(false);
    expect(status({ nextDueOn: "2026-10-26" })).toEqual({ doNotUse: true, reasons: ["PPM_OVERDUE"], display: "do_not_use" });
  });

  it("makes every rule a reason on its own", () => {
    expect(status({ lifecycleStatus: "under_repair" }).reasons).toEqual(["NOT_IN_SERVICE"]);
    expect(status({ lifecycleStatus: "acceptance" }).reasons).toEqual(["NOT_IN_SERVICE"]);
    expect(status({ latestTestFailed: true }).reasons).toEqual(["FAILED_TEST"]);
    expect(status({ openNoticeMatches: 1 }).reasons).toEqual(["SAFETY_NOTICE"]);
    expect(status({ openFaultReport: true }).reasons).toEqual(["FAULT_REPORTED"]);
  });

  it("lists every reason that applies", () => {
    expect(status({ lifecycleStatus: "quarantined", nextDueOn: "2026-01-01", latestTestFailed: true, openFaultReport: true }).reasons)
      .toEqual(["NOT_IN_SERVICE", "PPM_OVERDUE", "FAILED_TEST", "FAULT_REPORTED"]);
  });

  it("shows a recall above every other problem", () => {
    expect(status({ openNoticeMatches: 2, latestTestFailed: true }).display).toBe("recalled");
  });

  it("shows decommissioned devices as decommissioned", () => {
    expect(status({ lifecycleStatus: "decommissioned", openNoticeMatches: 1 }).display).toBe("decommissioned");
  });

  it("never lets in use hide a problem", () => {
    expect(status({ inUse: true, openFaultReport: true }).display).toBe("do_not_use");
  });

  it("treats a device with no schedule as neither overdue nor due soon", () => {
    expect(status({ nextDueOn: null })).toEqual({ doNotUse: false, reasons: [], display: "available" });
  });
});

import { describe, expect, it } from "vitest";
import { checkOutBlockers, isLoanOverdue, libraryState } from "./library";

describe("libraryState", () => {
  it("is ready only when checked in cleaned and charged", () => {
    expect(libraryState(true, { direction: "check_in", cleaned: true, charged: true })).toBe("ready");
    expect(libraryState(true, { direction: "check_in", cleaned: true, charged: false })).toBe("needs_prep");
    expect(libraryState(true, { direction: "check_in", cleaned: false, charged: true })).toBe("needs_prep");
  });

  it("needs prep when there is no check-in record", () => {
    expect(libraryState(true, null)).toBe("needs_prep");
    expect(libraryState(true, { direction: "check_out", cleaned: null, charged: null })).toBe("needs_prep");
  });

  it("is out whenever the device is not in the library", () => {
    expect(libraryState(false, { direction: "check_in", cleaned: true, charged: true })).toBe("out");
  });
});

describe("checkOutBlockers", () => {
  it("lets a ready, safe device go out", () => {
    expect(checkOutBlockers({ state: "ready", doNotUse: false })).toEqual([]);
  });

  it("stops unsafe, absent or unprepared devices", () => {
    expect(checkOutBlockers({ state: "ready", doNotUse: true })).toEqual(["This device must not be used."]);
    expect(checkOutBlockers({ state: "out", doNotUse: false })).toEqual(["It is not in the library. Check it in first."]);
    expect(checkOutBlockers({ state: "needs_prep", doNotUse: true })).toHaveLength(2);
  });
});

describe("isLoanOverdue", () => {
  it("chases loans out more than 14 days", () => {
    expect(isLoanOverdue("2026-10-13", "2026-10-27")).toBe(false);
    expect(isLoanOverdue("2026-10-12", "2026-10-27")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { addDays, addMonths, addYears, daysBetween, isIsoDate, todayInLondon } from "./dates";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds months, clamping to the end of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-08-15", 6)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-27", "2026-11-10")).toBe(14);
    expect(daysBetween("2026-11-10", "2026-10-27")).toBe(-14);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-27")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("27/10/2026")).toBe(false);
  });

  it("reads today in London, not UTC", () => {
    // 23:30 UTC on 30 June is already 1 July in London (BST, UTC+1).
    expect(todayInLondon(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    // In winter London is on UTC.
    expect(todayInLondon(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });
});

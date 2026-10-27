import { describe, expect, it } from "vitest";
import { emScore, incidentHistoryScore, SCHEDULED_PPM_THRESHOLD } from "./emScore";
import { isDueSoon, isOverdue, needsPpmWorkOrder, nextDueAfterCompletion } from "./ppm";
import { ppmPriority, repairPriority } from "./priority";
import { measurementOutcome } from "./testResult";

const TODAY = "2026-10-27";

describe("PPM dates", () => {
  it("is in date on the due day and overdue the day after", () => {
    expect(isOverdue("2026-10-27", TODAY)).toBe(false);
    expect(isOverdue("2026-10-26", TODAY)).toBe(true);
  });

  it("is due soon within 14 days, but not once overdue", () => {
    expect(isDueSoon("2026-11-10", TODAY)).toBe(true);
    expect(isDueSoon("2026-11-11", TODAY)).toBe(false);
    expect(isDueSoon("2026-10-26", TODAY)).toBe(false);
  });

  it("needs a PPM job when due soon or overdue", () => {
    expect(needsPpmWorkOrder("2026-11-10", TODAY)).toBe(true);
    expect(needsPpmWorkOrder("2026-09-01", TODAY)).toBe(true);
    expect(needsPpmWorkOrder("2026-11-11", TODAY)).toBe(false);
  });

  it("counts the next due date from completion", () => {
    expect(nextDueAfterCompletion("2026-10-27", 12)).toBe("2027-10-27");
    expect(nextDueAfterCompletion("2026-08-31", 6)).toBe("2027-02-28");
  });
});

describe("measurement outcome", () => {
  it("passes on the limits and fails outside them", () => {
    expect(measurementOutcome(0.3, null, 0.3)).toBe("pass");
    expect(measurementOutcome(0.301, null, 0.3)).toBe("fail");
    expect(measurementOutcome(170, 170, 230)).toBe("pass");
    expect(measurementOutcome(169.9, 170, 230)).toBe("fail");
  });

  it("refuses a measurement without limits or a number", () => {
    expect(() => measurementOutcome(1, null, null)).toThrow();
    expect(() => measurementOutcome(Number.NaN, 0, 1)).toThrow();
  });
});

describe("EM score", () => {
  it("adds the four parts", () => {
    expect(emScore({ function: 10, physicalRisk: 5, maintenance: 5, incidentHistory: 2 })).toBe(22);
    expect(emScore({ function: 2, physicalRisk: 1, maintenance: 1, incidentHistory: -2 })).toBe(2);
  });

  it("rejects parts outside their scales", () => {
    expect(() => emScore({ function: 1, physicalRisk: 1, maintenance: 1, incidentHistory: 0 })).toThrow();
    expect(() => emScore({ function: 5, physicalRisk: 6, maintenance: 1, incidentHistory: 0 })).toThrow();
    expect(() => emScore({ function: 5, physicalRisk: 1, maintenance: 1, incidentHistory: 3 })).toThrow();
  });

  it("scores incident history by average time between failures", () => {
    expect(incidentHistoryScore(0)).toBe(-2);
    expect(incidentHistoryScore(3)).toBe(2); // every 4 months
    expect(incidentHistoryScore(12 / 7)).toBe(1); // every 7 months
    expect(incidentHistoryScore(1)).toBe(0); // every 12 months
    expect(incidentHistoryScore(12 / 18)).toBe(0); // exactly 18 months
    expect(incidentHistoryScore(0.5)).toBe(-1); // every 24 months
    expect(incidentHistoryScore(0.3)).toBe(-2); // every 40 months
  });

  it("puts 12 and above on scheduled PPM", () => {
    expect(SCHEDULED_PPM_THRESHOLD).toBe(12);
  });
});

describe("priority", () => {
  it("sets PPM priority from the EM score and raises it when overdue", () => {
    expect(ppmPriority(18, false)).toBe("high");
    expect(ppmPriority(13, false)).toBe("normal");
    expect(ppmPriority(9, false)).toBe("low");
    expect(ppmPriority(9, true)).toBe("normal");
    expect(ppmPriority(18, true)).toBe("critical");
  });

  it("makes faults on life support critical", () => {
    expect(repairPriority("life_support")).toBe("critical");
    expect(repairPriority("infusion")).toBe("high");
  });
});

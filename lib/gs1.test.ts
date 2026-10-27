import { describe, expect, it } from "vitest";
import { COMPANY_PREFIX, gs1CheckDigit, isValidGiai, isValidGln, makeGiai, makeGln } from "./gs1";

describe("GS1 identifiers", () => {
  it("computes the mod-10 check digit", () => {
    expect(gs1CheckDigit("400638133393")).toBe(1); // EAN-13 4006381333931
    expect(gs1CheckDigit("629104150021")).toBe(3); // EAN-13 6291041500213
  });

  it("builds valid 13-digit GLNs in the restricted-circulation range", () => {
    const gln = makeGln(10_001);
    expect(gln).toHaveLength(13);
    expect(gln.startsWith(COMPANY_PREFIX)).toBe(true);
    expect(COMPANY_PREFIX.startsWith("02")).toBe(true);
    expect(isValidGln(gln)).toBe(true);
  });

  it("rejects a GLN with a wrong check digit", () => {
    const gln = makeGln(10_001);
    const wrong = gln.slice(0, 12) + ((Number(gln[12]) + 1) % 10);
    expect(isValidGln(wrong)).toBe(false);
  });

  it("refuses location references that do not fit", () => {
    expect(() => makeGln(123_456)).toThrow();
  });

  it("builds GIAIs of at most 30 characters", () => {
    expect(makeGiai("IVP000001")).toBe("0299999IVP000001");
    expect(isValidGiai("0299999IVP000001")).toBe(true);
    expect(() => makeGiai("X".repeat(24))).toThrow();
    expect(() => makeGiai("ivp-1")).toThrow();
  });
});

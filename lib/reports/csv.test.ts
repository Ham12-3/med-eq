import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralises text a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2")).toBe("'-2");
  });

  it("leaves real numbers, including negatives, as numbers", () => {
    expect(csvCell(-2)).toBe("-2");
    expect(csvCell(97.5)).toBe("97.5");
  });

  it("writes empty cells, yes and no", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("Yes");
  });

  it("starts with a byte-order mark and uses CRLF", () => {
    const csv = toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: 1, b: "x" }, { a: 2, b: null }]);
    expect(csv).toBe("﻿A,B\r\n1,x\r\n2,\r\n");
  });
});

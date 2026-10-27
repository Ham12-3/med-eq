import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filtersToQuery, parseAssetFilters, sortChange } from "./filters";

describe("asset filters", () => {
  it("defaults when nothing is given", () => {
    expect(parseAssetFilters({})).toEqual(DEFAULT_FILTERS);
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips through the query string", () => {
    const params = new URLSearchParams(
      "q=VP2&status=do_not_use&status=recalled&model=ventilator&dept=ICU&overdue=1&sort=next_due&dir=desc&page=3",
    );
    const parsed = parseAssetFilters(Object.fromEntries([...params.keys()].map((k) => [k, params.getAll(k)])));
    expect(parsed).toMatchObject({
      q: "VP2", status: ["do_not_use", "recalled"], model: "ventilator", dept: "ICU",
      overdue: true, sort: "next_due", dir: "desc", page: 3,
    });
    expect(filtersToQuery(parsed)).toBe(params.toString());
  });

  it("drops values it does not recognise", () => {
    const parsed = parseAssetFilters({
      status: ["exploded", "available"], model: "Robert'); DROP TABLE", dept: "icu", floor: "1 or 1=1",
      sort: "password", dir: "sideways", page: "-4",
    });
    expect(parsed).toMatchObject({ status: ["available"], model: "", dept: "", floor: "", sort: "giai", dir: "asc", page: 1 });
  });

  it("flips direction on the same column and resets to page 1", () => {
    const f = { ...DEFAULT_FILTERS, page: 4 };
    expect(sortChange(f, "giai")).toEqual({ sort: "giai", dir: "desc", page: 1 });
    expect(sortChange({ ...f, dir: "desc" }, "giai")).toEqual({ sort: "giai", dir: "asc", page: 1 });
    expect(sortChange(f, "status")).toEqual({ sort: "status", dir: "asc", page: 1 });
  });
});

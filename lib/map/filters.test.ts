import { describe, expect, it } from "vitest";
import { isFiltering, mapFiltersToQuery, NO_MAP_FILTERS, parseMapFilters } from "./filters";

const id = "0b6c1f1e-0000-4000-8000-000000000001";

describe("map filters", () => {
  it("round-trips through the query string", () => {
    const query = `floor=${id}&model=ventilator&dept=ICU&notice=${id}`;
    const parsed = parseMapFilters(Object.fromEntries(new URLSearchParams(query)));
    expect(parsed).toEqual({ floor: id, model: "ventilator", dept: "ICU", notice: id });
    expect(mapFiltersToQuery(parsed)).toBe(query);
  });

  it("drops values it does not recognise", () => {
    expect(parseMapFilters({ floor: "ground", model: "Robert'); DROP", dept: "icu", notice: "1" })).toEqual(NO_MAP_FILTERS);
  });

  it("keeps the other filters when switching floor", () => {
    expect(mapFiltersToQuery({ ...NO_MAP_FILTERS, model: "ventilator" }, { floor: id })).toBe(`floor=${id}&model=ventilator`);
  });

  it("counts the floor as a place, not a filter", () => {
    expect(isFiltering({ ...NO_MAP_FILTERS, floor: id })).toBe(false);
    expect(isFiltering({ ...NO_MAP_FILTERS, dept: "ICU" })).toBe(true);
  });
});

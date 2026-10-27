import { describe, expect, it } from "vitest";
import { auditFiltersToQuery, DEFAULT_AUDIT_FILTERS, describeAuditFilters, parseAuditFilters } from "./filters";

describe("audit filters", () => {
  it("defaults when nothing is given", () => {
    expect(parseAuditFilters({})).toEqual(DEFAULT_AUDIT_FILTERS);
    expect(auditFiltersToQuery(DEFAULT_AUDIT_FILTERS)).toBe("");
  });

  it("round-trips through the query string", () => {
    const query = "from=2026-10-01&to=2026-10-27&user=0b6c1f1e-0000-4000-8000-000000000001&table=work_orders&action=update&asset=0299999IVP000010&notice=FSN%2F2026%2F1&page=2";
    const parsed = parseAuditFilters(Object.fromEntries(new URLSearchParams(query)));
    expect(parsed).toMatchObject({ from: "2026-10-01", table: "work_orders", action: "update", asset: "0299999IVP000010", notice: "FSN/2026/1", page: 2 });
    expect(auditFiltersToQuery(parsed)).toBe(query);
  });

  it("drops anything it does not recognise", () => {
    expect(parseAuditFilters({ from: "yesterday", table: "pg_user", action: "delete", user: "admin", asset: "x'; drop", page: "-1" }))
      .toEqual(DEFAULT_AUDIT_FILTERS);
  });

  it("upper-cases a device code typed in lower case", () => {
    expect(parseAuditFilters({ asset: "0299999ivp000010" }).asset).toBe("0299999IVP000010");
  });

  it("describes the filters for exported evidence", () => {
    expect(describeAuditFilters(DEFAULT_AUDIT_FILTERS)).toBe("All audit entries.");
    expect(describeAuditFilters({ ...DEFAULT_AUDIT_FILTERS, asset: "0299999IVP000010", from: "2026-01-01", to: "2026-10-27" }))
      .toBe("Audit entries for device 0299999IVP000010, from 2026-01-01 to 2026-10-27.");
  });
});

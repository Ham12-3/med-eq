// The TypeScript rules and the SQL function must agree on every asset.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { deriveAssetStatus, type LifecycleStatus } from "@/lib/rules/assetStatus";
import { connectAsApp, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

type Row = {
  asset_id: string;
  lifecycle_status: LifecycleStatus;
  in_use: boolean;
  next_due_on: string | null;
  latest_test_failed: boolean;
  open_notice_matches: number;
  open_fault_report: boolean;
  do_not_use: boolean;
  reasons: string[];
  display_status: string;
};

async function rowsOn(today: string) {
  return db.execute<Row>(sql`
    select f.asset_id, f.lifecycle_status, f.in_use, f.next_due_on::text as next_due_on,
           f.latest_test_failed, f.open_notice_matches, f.open_fault_report,
           s.do_not_use, s.reasons, s.display_status
    from asset_status_facts f
    join asset_status_on(${today}::date) s on s.asset_id = f.asset_id`);
}

describe("status parity", () => {
  for (const today of [TEST_TODAY, "2026-11-20", "2027-06-01"]) {
    it(`agrees on every asset as of ${today}`, async () => {
      const rows = await rowsOn(today);
      expect(rows).toHaveLength(403);
      for (const row of rows) {
        const ts = deriveAssetStatus({
          lifecycleStatus: row.lifecycle_status,
          inUse: row.in_use,
          nextDueOn: row.next_due_on,
          latestTestFailed: row.latest_test_failed,
          openNoticeMatches: row.open_notice_matches,
          openFaultReport: row.open_fault_report,
        }, today);
        expect({ doNotUse: row.do_not_use, reasons: row.reasons, display: row.display_status }, row.asset_id).toEqual(ts);
      }
    });
  }

  it("flags the seeded problem devices as Do not use", async () => {
    const rows = await rowsOn(TEST_TODAY);
    const by = (status: string) => rows.filter((r) => r.lifecycle_status === status);
    for (const r of [...by("quarantined"), ...by("under_repair"), ...by("acceptance")]) expect(r.do_not_use).toBe(true);
    for (const r of by("quarantined")) expect(r.reasons).toContain("FAILED_TEST");
    expect(rows.filter((r) => r.reasons.includes("PPM_OVERDUE"))).toHaveLength(32);
    expect(rows.filter((r) => r.lifecycle_status === "in_service" && r.open_fault_report)).toHaveLength(3);
  });
});

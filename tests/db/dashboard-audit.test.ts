import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser, type Db } from "@/db/client";
import { DEFAULT_AUDIT_FILTERS, type AuditFilters } from "@/lib/audit/filters";
import { DEFAULT_FILTERS } from "@/lib/assets/filters";
import { loadActiveUser } from "@/lib/auth/users";
import { listAssets } from "@/lib/data/assets";
import { changeSummary, searchAudit } from "@/lib/data/audit";
import { dashboardNumbers, technicianWorkload } from "@/lib/data/dashboard";
import { createNotice } from "@/lib/data/notices";
import { listOpenJobs } from "@/lib/data/workOrders";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import { REPORTS } from "@/lib/reports/definitions";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

const report = (slug: string) => REPORTS.find((r) => r.slug === slug)!.load(db, TEST_TODAY);
const audit = (f: Partial<AuditFilters>, on: Db = db) => searchAudit(on, { ...DEFAULT_AUDIT_FILTERS, ...f }, { limit: 100_000, offset: 0 });

describe("dashboard", () => {
  it("agrees with the reports and lists each number links to", async () => {
    const n = await dashboardNumbers(db, TEST_TODAY);
    const all = (await report("ppm-compliance")).find((r) => r.breakdown === "All")!;
    expect(n.compliance).toBe(all.compliance);
    expect(n.overduePpm).toBe(32);
    expect(n.overduePpm).toBe((await report("overdue-ppm")).length);
    expect(n.doNotUse).toBe((await listAssets(db, { ...DEFAULT_FILTERS, status: ["do_not_use", "recalled"] }, TEST_TODAY)).total);
    expect(n.failedTests90).toBe((await report("failed-tests")).length);
    const mttr = (await report("mean-time-to-repair"))[0];
    expect(n.mttrDays).toBe(mttr.meanDays);
    expect(n.repairs90).toBe(mttr.repairs);
    expect(n.openNotices).toBe(0);
    expect(n.unassignedJobs).toBe((await listOpenJobs(db, null, TEST_TODAY)).length);
  });

  it("counts every assigned open job in the workload table", async () => {
    const workload = await technicianWorkload(db, TEST_TODAY);
    const [{ n }] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from work_orders w join users u on u.id = w.assignee_id
      where u.role = 'technician' and w.status in ('open', 'in_progress', 'awaiting_parts')`);
    expect(workload.reduce((s, w) => s + w.open, 0)).toBe(n);
    expect(workload).toHaveLength(5);
  });
});

describe("audit search", () => {
  it("finds a device's whole history and nothing else's", async () => {
    const [asset] = await db.execute<{ id: string; giai: string }>(sql`
      select a.id, a.giai from assets a where exists (select 1 from parts_used p join work_orders w on w.id = p.work_order_id where w.asset_id = a.id)
      order by a.giai limit 1`);
    const result = await audit({ asset: asset.giai });
    if (!result.ok) throw new Error(result.message);

    const jobs = new Set((await db.execute<{ id: string }>(sql`select id from work_orders where asset_id = ${asset.id}`)).map((j) => j.id));
    for (const e of result.entries) {
      const related = (e.tableName === "assets" && e.recordId === asset.id)
        || e.newValue.asset_id === asset.id
        || jobs.has(String(e.newValue.work_order_id));
      expect(related, `${e.tableName} ${e.recordId}`).toBe(true);
    }
    const tables = new Set(result.entries.map((e) => e.tableName));
    for (const t of ["assets", "ppm_schedules", "work_orders", "test_results", "parts_used", "location_events"]) expect(tables, t).toContain(t);

    // Same count straight from the database.
    const [{ n }] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from audit_log al
      where (al.table_name = 'assets' and al.record_id = ${asset.id}) or al.new_value->>'asset_id' = ${asset.id}
         or (al.table_name in ('test_results', 'parts_used') and al.new_value->>'work_order_id' in (select id::text from work_orders where asset_id = ${asset.id}))`);
    expect(result.total).toBe(n);
  });

  it("follows a safety notice to its criteria, matches and recall jobs", async () => {
    const [u] = await db.execute<{ id: string }>(sql`select id from users where role = 'admin' and active limit 1`);
    const admin = (await loadActiveUser(db, u.id))!;
    await rolledBack(() => withUser(db, admin.id, async (tx) => {
      const [ecg] = await tx.execute<{ id: string }>(sql`select id from device_models where slug = 'ecg-machine'`);
      const { matched } = await createNotice(tx, admin, {
        reference: "AUDIT/TEST/1", source: "natpsa", title: "t", description: "d", requiredAction: "a",
        issuedOn: TEST_TODAY, deadline: TEST_TODAY, quarantineRequired: true,
        criteria: [{ deviceModelId: ecg.id, serialFrom: null, serialTo: null, firmwareVersions: null }],
      });
      const result = await audit({ notice: "AUDIT/TEST/1" }, tx as unknown as Db);
      if (!result.ok) throw new Error(result.message);
      const count = (t: string) => result.entries.filter((e) => e.tableName === t).length;
      expect(count("safety_notices")).toBe(1);
      expect(count("safety_notice_criteria")).toBe(1);
      expect(count("safety_notice_matches")).toBe(matched);
      expect(count("work_orders")).toBe(matched);
      expect(result.entries.every((e) => e.userName === admin.name)).toBe(true);
      throw new Rollback();
    }));
  });

  it("keeps date ranges to UK days and filters by user, type and kind", async () => {
    const day = await audit({ from: TEST_TODAY, to: TEST_TODAY });
    if (!day.ok) throw new Error(day.message);
    expect(day.total).toBeGreaterThan(0); // the seed's daily job ran "today"
    expect(day.entries.every((e) => e.at.startsWith(TEST_TODAY))).toBe(true);

    const updates = await audit({ table: "work_orders", action: "update", user: SYSTEM_USER_ID });
    if (!updates.ok) throw new Error(updates.message);
    expect(updates.entries.every((e) => e.tableName === "work_orders" && e.action === "update" && e.userName === "MedAsset System")).toBe(true);
    expect(updates.entries.every((e) => changeSummary(e).startsWith("priority:"))).toBe(true); // the daily job's reprioritising
  });

  it("explains an unknown device or notice", async () => {
    expect(await audit({ asset: "0299999XXX000000" })).toEqual({ ok: false, message: "No device has the code 0299999XXX000000." });
    expect(await audit({ notice: "NOPE" })).toEqual({ ok: false, message: "No safety notice has the reference NOPE." });
  });
});

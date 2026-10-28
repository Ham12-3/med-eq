// Work orders against the seeded test database. Every test writes inside a
// transaction that is rolled back, so the seeded data stays as other tests expect.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser, type Tx } from "@/db/client";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import { loadActiveUser, type CurrentUser } from "@/lib/auth/users";
import { getAssetSummary } from "@/lib/data/assets";
import {
  closeJob, getJob, JobError, listAnalysers, reportFault, saveInspection, saveResults, startJob, type ResultEntry,
} from "@/lib/data/workOrders";
import { addDays, addMonths } from "@/lib/dates";
import { runDailyJobIn } from "@/lib/jobs/daily";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

async function userWithRole(role: string, offset = 0): Promise<CurrentUser> {
  const [u] = await db.execute<{ id: string }>(sql`select id from users where role = ${role} and active order by name offset ${offset} limit 1`);
  return (await loadActiveUser(db, u.id))!;
}

/** Runs `fn` as `user` in a transaction, then rolls it back. */
async function asUser(user: CurrentUser, fn: (tx: Tx) => Promise<void>) {
  await rolledBack(() => withUser(db, user.id, async (tx) => {
    await fn(tx);
    throw new Rollback();
  }));
}

/** Passing results for every template item of a job. */
function passingEntries(items: Awaited<ReturnType<typeof getJob>> extends infer J ? J extends { items: infer I } ? I : never : never, failCode?: string): ResultEntry[] {
  return items.map((i) => {
    if (i.kind === "check") return { itemId: i.id, kind: "check", outcome: i.code === failCode ? "fail" : "pass" };
    const inside = i.lower !== null && i.upper !== null ? (i.lower + i.upper) / 2 : i.upper !== null ? i.upper / 2 : i.lower! * 1.2;
    const outside = i.upper !== null ? i.upper * 1.5 + 1 : i.lower! - 10;
    return { itemId: i.id, kind: "measurement", value: String(i.code === failCode ? outside : inside) };
  });
}

const INSPECTED = { clean: true, decontaminated: true, controlSettings: "Ward defaults restored" };

/** An open PPM job on a healthy device, assigned to `tech` so they may work it. */
async function openPpmOnHealthyAsset(tx: Tx, tech: CurrentUser) {
  const [row] = await tx.execute<{ id: string }>(sql`
    select w.id from work_orders w
    join asset_status_on(${TEST_TODAY}::date) s on s.asset_id = w.asset_id
    where w.type = 'ppm' and w.status = 'open' and not s.do_not_use and w.assignee_id = ${tech.id}
    order by w.number limit 1`);
  return (await getJob(tx, row.id, TEST_TODAY))!;
}

async function usableAnalyser(tx: Tx) {
  return (await listAnalysers(tx, TEST_TODAY)).find((a) => !a.doNotUse)!.id;
}

describe("daily job", () => {
  it("opens nothing new on the seeded day, which already has its jobs", async () => {
    await rolledBack(() => withUser(db, SYSTEM_USER_ID, async (tx) => {
      expect(await runDailyJobIn(tx, TEST_TODAY)).toEqual({ emScored: 0, created: [], reprioritised: 0 });
      throw new Rollback();
    }));
  });

  it("opens PPM jobs 14 days ahead, spreads them across technicians, and is idempotent", async () => {
    const later = addDays(TEST_TODAY, 30);
    await rolledBack(() => withUser(db, SYSTEM_USER_ID, async (tx) => {
      const [{ expected }] = await tx.execute<{ expected: number }>(sql`
        select count(*)::int as expected from ppm_schedules p join assets a on a.id = p.asset_id
        where p.active and a.lifecycle_status <> 'decommissioned' and p.next_due_on <= ${addDays(later, 14)}::date
          and not exists (select 1 from work_orders w where w.ppm_schedule_id = p.id and w.status in ('open', 'in_progress', 'awaiting_parts'))`);
      const openLoads = async () => (await tx.execute<{ n: number }>(sql`
        select (select count(*)::int from work_orders w where w.assignee_id = u.id and w.status in ('open', 'in_progress', 'awaiting_parts')) as n
        from users u where u.role = 'technician' and u.active`)).map((r) => r.n);
      const spread = (loads: number[]) => Math.max(...loads) - Math.min(...loads);
      const spreadBefore = spread(await openLoads());

      const first = await runDailyJobIn(tx, later);
      expect(first.created.length).toBe(expected);
      expect(first.created.length).toBeGreaterThan(10);
      expect(first.created.every((n) => /^WO-\d{6}$/.test(n))).toBe(true);
      expect(Number(first.created[0].slice(3))).toBeGreaterThan(829); // numbers carry on after the seed

      // New jobs go to whoever has the fewest open jobs, so workloads end up no less even than before.
      expect(spread(await openLoads())).toBeLessThanOrEqual(Math.max(1, spreadBefore));

      expect((await runDailyJobIn(tx, later)).created).toEqual([]);
      throw new Rollback();
    }));
  });

  it("raises the priority of PPM jobs that have become overdue", async () => {
    await rolledBack(() => withUser(db, SYSTEM_USER_ID, async (tx) => {
      const [job] = await tx.execute<{ id: string; due_on: string; priority: string }>(sql`
        select id, due_on::text, priority from work_orders
        where type = 'ppm' and status = 'open' and due_on >= ${TEST_TODAY}::date and priority = 'normal' limit 1`);
      const result = await runDailyJobIn(tx, addDays(job.due_on, 1));
      expect(result.reprioritised).toBeGreaterThan(0);
      const [after] = await tx.execute<{ priority: string }>(sql`select priority from work_orders where id = ${job.id}`);
      expect(after.priority).toBe("high");
      throw new Rollback();
    }));
  });
});

describe("closing a PPM job", () => {
  it("refuses to close until the inspection and every required test are done", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      const blocked = await closeJob(tx, job.id, tech, { today: TEST_TODAY });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.blockers.map((b) => b.code)).toContain("INSPECTION_INCOMPLETE");
        expect(blocked.blockers.map((b) => b.code)).toContain("MISSING_RESULT");
      }
    });
  });

  it("returns the device to use and rolls the schedule forward from today", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      await saveInspection(tx, job.id, tech, { inspection: INSPECTED, calibrationNotes: null });
      await saveResults(tx, job.id, tech, passingEntries(job.items), await usableAnalyser(tx));
      const closed = await closeJob(tx, job.id, tech, { today: TEST_TODAY });
      expect(closed).toEqual({ ok: true, outcome: "returned_to_use", followUp: null });

      const asset = (await getAssetSummary(tx, job.assetId, TEST_TODAY))!;
      expect(asset.lastDoneOn).toBe(TEST_TODAY);
      expect(asset.nextDueOn).toBe(addMonths(TEST_TODAY, asset.intervalMonths!));
      expect(asset.doNotUse).toBe(false);
      expect(asset.display).not.toBe("due_soon");

      const [audit] = await tx.execute<{ user_id: string }>(sql`
        select user_id from audit_log where table_name = 'work_orders' and record_id = ${job.id} order by id desc limit 1`);
      expect(audit.user_id).toBe(tech.id);
    });
  });

  it("quarantines the device on a failed test, keeps the schedule, and opens a repair (Q3)", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      const failing = job.items.find((i) => i.kind === "measurement" && i.group === "electrical_safety")!;
      const before = (await getAssetSummary(tx, job.assetId, TEST_TODAY))!;
      await saveInspection(tx, job.id, tech, { inspection: INSPECTED, calibrationNotes: null });
      await saveResults(tx, job.id, tech, passingEntries(job.items, failing.code), await usableAnalyser(tx));
      const closed = await closeJob(tx, job.id, tech, { today: TEST_TODAY });
      expect(closed).toMatchObject({ ok: true, outcome: "failed_quarantined" });
      if (!closed.ok) return;
      expect(closed.followUp).toMatch(/^WO-\d{6}$/);

      const asset = (await getAssetSummary(tx, job.assetId, TEST_TODAY))!;
      expect(asset.lifecycleStatus).toBe("quarantined");
      expect(asset.nextDueOn).toBe(before.nextDueOn);
      expect(asset.doNotUse).toBe(true);
      expect(asset.reasons).toEqual(expect.arrayContaining(["NOT_IN_SERVICE", "FAILED_TEST", "FAULT_REPORTED"]));

      const [repair] = await tx.execute<{ type: string; status: string; fault_reason: string; assignee_id: string }>(sql`
        select type, status, fault_reason, assignee_id from work_orders where number = ${closed.followUp}`);
      expect(repair).toMatchObject({ type: "repair", status: "open", assignee_id: tech.id });
      expect(repair.fault_reason).toContain(failing.name);
    });
  });

  it("works out measurement outcomes from the limits, not the form", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      const pe = job.items.find((i) => i.kind === "measurement" && i.upper !== null)!;
      await saveResults(tx, job.id, tech, [{ itemId: pe.id, kind: "measurement", value: String(pe.upper! + 1) }], await usableAnalyser(tx));
      const [r] = await tx.execute<{ outcome: string }>(sql`
        select outcome from test_results where work_order_id = ${job.id} and template_item_id = ${pe.id}`);
      expect(r.outcome).toBe("fail");
      // Entering it again replaces the result; the old one stays in the audit log.
      await saveResults(tx, job.id, tech, [{ itemId: pe.id, kind: "measurement", value: String(pe.upper!) }], await usableAnalyser(tx));
      const rows = await tx.execute<{ outcome: string }>(sql`
        select outcome from test_results where work_order_id = ${job.id} and template_item_id = ${pe.id}`);
      expect(rows.map((x) => x.outcome)).toEqual(["pass"]);
    });
  });

  it("leaves a result alone when it is sent again unchanged", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      const analyser = await usableAnalyser(tx);
      const entries = passingEntries(job.items);
      const pe = job.items.find((i) => i.kind === "measurement" && i.upper !== null)!;
      expect(await saveResults(tx, job.id, tech, entries, analyser)).toBe(entries.length);

      const resultAudit = async () => (await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from audit_log where table_name = 'test_results' and new_value->>'work_order_id' = ${job.id}`))[0].n;
      const before = await resultAudit();

      // The whole form again, with one reading changed: only that one is written.
      const retest = entries.map((e) => e.itemId === pe.id ? { ...e, value: String(pe.upper! + 1) } : e);
      expect(await saveResults(tx, job.id, tech, retest, analyser)).toBe(1);
      expect(await resultAudit()).toBe(before + 1);

      // Exactly the same again: nothing is written.
      expect(await saveResults(tx, job.id, tech, retest, analyser)).toBe(0);
      expect(await resultAudit()).toBe(before + 1);
    });
  });

  it("rejects not-applicable on a required check, a missing analyser and a non-number", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      const check = job.items.find((i) => i.kind === "check" && i.required)!;
      const measurement = job.items.find((i) => i.kind === "measurement")!;
      await expect(saveResults(tx, job.id, tech, [{ itemId: check.id, kind: "check", outcome: "not_applicable" }], null)).rejects.toThrow(JobError);
      await expect(saveResults(tx, job.id, tech, [{ itemId: measurement.id, kind: "measurement", value: "1" }], null)).rejects.toThrow(/analyser/);
      await expect(saveResults(tx, job.id, tech, [{ itemId: measurement.id, kind: "measurement", value: "abc" }], await usableAnalyser(tx))).rejects.toThrow(/number/);
    });
  });

  it("keeps a job to its assignee, unless a manager steps in", async () => {
    const tech = await userWithRole("technician");
    const other = await userWithRole("technician", 1);
    const manager = await userWithRole("manager");
    await asUser(tech, async (tx) => {
      const job = await openPpmOnHealthyAsset(tx, tech);
      await tx.execute(sql`update work_orders set assignee_id = ${tech.id} where id = ${job.id}`);
      await expect(startJob(tx, job.id, other)).rejects.toThrow(/assigned to someone else/);
      await startJob(tx, job.id, manager);
    });
  });
});

describe("ward fault reports and repairs", () => {
  async function healthyInUseCandidate(tx: Tx) {
    const [row] = await tx.execute<{ id: string }>(sql`
      select a.id from assets a join asset_status_on(${TEST_TODAY}::date) s on s.asset_id = a.id
      where s.display_status in ('available', 'in_use') and not exists (
        select 1 from work_orders w where w.asset_id = a.id and w.status in ('open', 'in_progress', 'awaiting_parts'))
      order by a.giai limit 1`);
    return row.id;
  }

  it("opens an unassigned repair, makes the device Do not use, and joins repeat reports", async () => {
    const nurse = await userWithRole("ward");
    await asUser(nurse, async (tx) => {
      const assetId = await healthyInUseCandidate(tx);
      await tx.execute(sql`update assets set in_use = true where id = ${assetId}`);
      const first = await reportFault(tx, nurse, assetId, "Alarm fault");
      expect(first).toMatchObject({ ok: true, alreadyReported: false });
      if (!first.ok) return;

      const [job] = await tx.execute<{ type: string; status: string; assignee_id: string | null; reported_by_id: string; fault_reason: string }>(sql`
        select type, status, assignee_id, reported_by_id, fault_reason from work_orders where number = ${first.number}`);
      expect(job).toEqual({ type: "repair", status: "open", assignee_id: null, reported_by_id: nurse.id, fault_reason: "Alarm fault" });

      const asset = (await getAssetSummary(tx, assetId, TEST_TODAY))!;
      expect(asset.reasons).toEqual(["FAULT_REPORTED"]);
      expect(asset.inUse).toBe(false);

      expect(await reportFault(tx, nurse, assetId, "Display fault")).toEqual({ ok: true, number: first.number, alreadyReported: true });
    });
  });

  it("takes the device out of service when the repair starts, and back when it passes", async () => {
    const nurse = await userWithRole("ward");
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const assetId = await healthyInUseCandidate(tx);
      const report = await reportFault(tx, nurse, assetId, "Will not power on");
      if (!report.ok) throw new Error("report failed");
      const [{ id }] = await tx.execute<{ id: string }>(sql`select id from work_orders where number = ${report.number}`);

      await startJob(tx, id, tech);
      expect((await getAssetSummary(tx, assetId, TEST_TODAY))!.lifecycleStatus).toBe("under_repair");

      const job = (await getJob(tx, id, TEST_TODAY))!;
      expect(job.assigneeId).toBe(tech.id);
      const failing = job.items.find((i) => i.kind === "measurement")!;
      await saveInspection(tx, id, tech, { inspection: INSPECTED, calibrationNotes: null });
      await saveResults(tx, id, tech, passingEntries(job.items, failing.code), await usableAnalyser(tx));
      const stillFailing = await closeJob(tx, id, tech, { today: TEST_TODAY });
      expect(stillFailing.ok).toBe(false);
      if (!stillFailing.ok) expect(stillFailing.blockers.map((b) => b.code)).toEqual(["REPAIR_STILL_FAILING"]);

      await saveResults(tx, id, tech, passingEntries(job.items), await usableAnalyser(tx));
      expect(await closeJob(tx, id, tech, { today: TEST_TODAY })).toEqual({ ok: true, outcome: "returned_to_use", followUp: null });
      const asset = (await getAssetSummary(tx, assetId, TEST_TODAY))!;
      expect(asset).toMatchObject({ lifecycleStatus: "in_service", doNotUse: false });
    });
  });

  it("refuses changes to a closed job", async () => {
    const tech = await userWithRole("technician");
    await asUser(tech, async (tx) => {
      const [done] = await tx.execute<{ id: string }>(sql`select id from work_orders where status = 'completed' limit 1`);
      await expect(startJob(tx, done.id, tech)).rejects.toThrow(/closed/);
    });
  });
});

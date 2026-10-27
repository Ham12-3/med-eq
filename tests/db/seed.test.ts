// Checks the seeded test database: totals from the brief, and that the
// history obeys the same rules the app will enforce.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { addMonths } from "@/lib/dates";
import { isValidGiai, isValidGln } from "@/lib/gs1";
import { connectAsApp, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const rows = await db.execute<Record<string, T>>(query);
  return Object.values(rows[0])[0];
}
const count = (query: ReturnType<typeof sql>) => one<number>(query);

const CLINICAL = sql`join device_models m on m.id = a.device_model_id and not m.is_test_equipment`;

describe("seed totals", () => {
  it("creates one fictional hospital", async () => {
    expect(await count(sql`select count(*)::int from sites`)).toBe(1);
    expect(await count(sql`select count(*)::int from buildings`)).toBe(2);
    expect(await count(sql`select count(*)::int from floors`)).toBe(3);
    expect(await count(sql`select count(*)::int from rooms`)).toBe(40);
    expect(await count(sql`select count(*)::int from departments`)).toBe(7);
  });

  it("creates 10 clinical device models plus the analyser model", async () => {
    expect(await count(sql`select count(*)::int from device_models where not is_test_equipment`)).toBe(10);
    expect(await count(sql`select count(*)::int from device_models where is_test_equipment`)).toBe(1);
  });

  it("creates 400 clinical assets and 3 analysers", async () => {
    expect(await count(sql`select count(*)::int from assets a ${CLINICAL}`)).toBe(400);
    expect(await count(sql`select count(*)::int from assets`)).toBe(403);
  });

  it("creates a user for every role", async () => {
    const roles = await db.execute<{ role: string }>(sql`select distinct role from users where active`);
    expect(roles.map((r) => r.role).sort()).toEqual(["admin", "library", "manager", "technician", "ward"]);
  });

  it("gives every device model a test template with required items", async () => {
    expect(await count(sql`
      select count(*)::int from device_models m
      where not exists (select 1 from test_template_items i where i.template_id = m.test_template_id and i.required)`)).toBe(0);
  });
});

describe("identifiers", () => {
  it("uses valid GLNs and names room meshes room_<GLN>", async () => {
    const rooms = await db.execute<{ gln: string; mesh_id: string }>(sql`select gln, mesh_id from rooms`);
    for (const r of rooms) {
      expect(isValidGln(r.gln), r.gln).toBe(true);
      expect(r.mesh_id).toBe(`room_${r.gln}`);
    }
    expect(isValidGln(await one<string>(sql`select gln from sites`))).toBe(true);
  });

  it("uses valid GIAIs", async () => {
    const rows = await db.execute<{ giai: string }>(sql`select giai from assets`);
    for (const r of rows) expect(isValidGiai(r.giai), r.giai).toBe(true);
  });
});

describe("locations", () => {
  it("knows where every asset is", async () => {
    expect(await count(sql`select count(*)::int from asset_current_location`)).toBe(403);
  });

  it("matches the view to the latest event per asset", async () => {
    expect(await count(sql`
      select count(*)::int from asset_current_location v
      where v.room_id <> (
        select e.room_id from location_events e where e.asset_id = v.asset_id
        order by e.occurred_at desc, e.id desc limit 1)`)).toBe(0);
  });

  it("keeps assets under repair or quarantined in the workshop", async () => {
    expect(await count(sql`
      select count(*)::int from assets a
      join asset_current_location v on v.asset_id = a.id
      join rooms r on r.id = v.room_id
      where a.lifecycle_status in ('under_repair', 'quarantined') and r.room_type <> 'workshop'`)).toBe(0);
  });
});

describe("PPM history", () => {
  it("has about 8 % of clinical assets overdue", async () => {
    const overdue = await count(sql`
      select count(*)::int from ppm_schedules p
      join assets a on a.id = p.asset_id ${CLINICAL}
      where p.active and p.next_due_on < ${TEST_TODAY}`);
    expect(overdue / 400).toBeGreaterThanOrEqual(0.07);
    expect(overdue / 400).toBeLessThanOrEqual(0.09);
  });

  it("counts every next due date from the last completion", async () => {
    expect(await count(sql`
      select count(*)::int from ppm_schedules
      where last_done_on is not null
        and next_due_on <> (last_done_on + make_interval(months => interval_months))::date`)).toBe(0);
  });

  it("spans about 18 months", async () => {
    const earliest = await one<string>(sql`
      select min(completed_at)::date::text from work_orders where type = 'ppm' and status = 'completed'`);
    expect(earliest <= addMonths(TEST_TODAY, -17)).toBe(true);
  });

  it("has an open PPM job for every active schedule due within 14 days, and never two", async () => {
    expect(await count(sql`
      select count(*)::int from ppm_schedules p
      where p.active and p.next_due_on <= ${TEST_TODAY}::date + 14
        and not exists (
          select 1 from work_orders w
          where w.ppm_schedule_id = p.id and w.status in ('open', 'in_progress', 'awaiting_parts'))`)).toBe(0);
  });

  it("has a few failed tests, current and past", async () => {
    const failedJobs = await count(sql`select count(*)::int from work_orders where outcome = 'failed_quarantined'`);
    expect(failedJobs).toBeGreaterThanOrEqual(10);
    expect(await count(sql`select count(*)::int from assets where lifecycle_status = 'quarantined'`)).toBe(6);
  });

  it("gives every quarantined asset a failed result and an open repair job", async () => {
    expect(await count(sql`
      select count(*)::int from assets a
      where a.lifecycle_status = 'quarantined' and (
        not exists (
          select 1 from work_orders w join test_results r on r.work_order_id = w.id
          where w.asset_id = a.id and r.outcome = 'fail')
        or not exists (
          select 1 from work_orders w
          where w.asset_id = a.id and w.type = 'repair' and w.status in ('open', 'in_progress', 'awaiting_parts')))`)).toBe(0);
  });

  it("has some repairs, open and closed", async () => {
    expect(await count(sql`select count(*)::int from work_orders where type = 'repair' and status = 'completed'`)).toBeGreaterThan(50);
    expect(await count(sql`select count(*)::int from work_orders where type = 'repair' and status <> 'completed'`)).toBeGreaterThanOrEqual(17);
    expect(await count(sql`select count(*)::int from parts_used`)).toBeGreaterThan(20);
  });
});

describe("history obeys the app's rules", () => {
  it("never closed a job without a result for every required test", async () => {
    expect(await count(sql`
      select count(*)::int from work_orders w
      join test_template_items i on i.template_id = w.test_template_id and i.required
      where w.status = 'completed'
        and not exists (
          select 1 from test_results r
          where r.work_order_id = w.id and r.template_item_id = i.id and r.phase = 'after'
            and r.outcome in ('pass', 'fail'))`)).toBe(0);
  });

  it("computed every measurement outcome from its limits", async () => {
    expect(await count(sql`
      select count(*)::int from test_results r
      join test_template_items i on i.id = r.template_item_id and i.kind = 'measurement'
      where r.outcome <> case
        when r.measured_value < r.lower_limit or r.measured_value > r.upper_limit then 'fail'::test_outcome
        else 'pass'::test_outcome end`)).toBe(0);
  });

  it("recorded a test analyser on every result that needs one", async () => {
    expect(await count(sql`
      select count(*)::int from test_results r
      join test_template_items i on i.id = r.template_item_id and i.requires_analyser
      left join assets a on a.id = r.analyser_asset_id
      left join device_models m on m.id = a.device_model_id
      where m.is_test_equipment is not true`)).toBe(0);
  });

  it("closed every job that returned a device to use without a failed result", async () => {
    expect(await count(sql`
      select count(*)::int from work_orders w
      join test_results r on r.work_order_id = w.id and r.outcome = 'fail'
      where w.outcome = 'returned_to_use'`)).toBe(0);
  });

  it("attributed every seeded row to the system user", async () => {
    expect(await count(sql`select count(*)::int from audit_log where user_id is distinct from ${"00000000-0000-4000-8000-000000000001"}`)).toBe(0);
    expect(await count(sql`select count(*)::int from audit_log where table_name = 'assets'`)).toBe(403);
  });
});

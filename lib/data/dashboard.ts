// The manager's six numbers. PLAN.md section 5, "Dashboard: the 6 numbers".
// Each uses the same definition as the report or list it links to (tests/db/dashboard.test.ts checks this).

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { IsoDate } from "@/lib/dates";

export type DashboardNumbers = {
  schedules: number;
  inDate: number;
  compliance: number | null; // % of active clinical schedules in date today
  overduePpm: number;
  doNotUse: number; // assets that must not be used, recalls included
  recalled: number;
  failedTests90: number;
  openNotices: number;
  devicesAwaitingNotice: number;
  repairs90: number;
  mttrDays: number | null; // mean days from fault raised to repair closed
  unassignedJobs: number;
};

export async function dashboardNumbers(db: Db, today: IsoDate): Promise<DashboardNumbers> {
  const [row] = await db.execute<DashboardNumbers>(sql`
    with schedules as (
      select p.next_due_on >= ${today}::date as in_date
      from ppm_schedules p
      join assets a on a.id = p.asset_id
      join device_models m on m.id = a.device_model_id and not m.is_test_equipment
      where p.active and a.lifecycle_status <> 'decommissioned'
    ),
    status as (select * from asset_status_on(${today}::date))
    select
      (select count(*)::int from schedules) as schedules,
      (select count(*) filter (where in_date)::int from schedules) as "inDate",
      (select round(100.0 * count(*) filter (where in_date) / nullif(count(*), 0), 1)::float8 from schedules) as compliance,
      (select count(*) filter (where not in_date)::int from schedules) as "overduePpm",
      (select count(*)::int from status where display_status in ('do_not_use', 'recalled')) as "doNotUse",
      (select count(*)::int from status where display_status = 'recalled') as recalled,
      (select count(*)::int from test_results r
         join work_orders w on w.id = r.work_order_id
         join assets a on a.id = w.asset_id
         join device_models m on m.id = a.device_model_id and not m.is_test_equipment
       where r.outcome = 'fail' and r.recorded_at >= ${today}::date - 90) as "failedTests90",
      (select count(*)::int from safety_notices where status = 'open') as "openNotices",
      (select count(*)::int from safety_notice_matches sm join safety_notices n on n.id = sm.notice_id
       where n.status = 'open' and sm.status = 'open') as "devicesAwaitingNotice",
      (select count(*)::int from work_orders w join assets a on a.id = w.asset_id
         join device_models m on m.id = a.device_model_id and not m.is_test_equipment
       where w.type = 'repair' and w.status = 'completed' and w.completed_at >= ${today}::date - 90) as "repairs90",
      (select round(avg(extract(epoch from (w.completed_at - w.created_at)) / 86400)::numeric, 1)::float8
       from work_orders w join assets a on a.id = w.asset_id
         join device_models m on m.id = a.device_model_id and not m.is_test_equipment
       where w.type = 'repair' and w.status = 'completed' and w.completed_at >= ${today}::date - 90) as "mttrDays",
      (select count(*)::int from work_orders where assignee_id is null and status in ('open', 'in_progress', 'awaiting_parts')) as "unassignedJobs"`);
  return row;
}

export type Workload = { id: string; name: string; open: number; overdue: number; urgent: number; awaitingParts: number };

/** Open jobs per technician, to balance the work. */
export async function technicianWorkload(db: Db, today: IsoDate): Promise<Workload[]> {
  const rows = await db.execute<Workload>(sql`
    select u.id, u.name,
      count(w.id)::int as open,
      count(w.id) filter (where w.due_on < ${today}::date)::int as overdue,
      count(w.id) filter (where w.priority in ('critical', 'high'))::int as urgent,
      count(w.id) filter (where w.status = 'awaiting_parts')::int as "awaitingParts"
    from users u
    left join work_orders w on w.assignee_id = u.id and w.status in ('open', 'in_progress', 'awaiting_parts')
    where u.active and u.role = 'technician'
    group by u.id, u.name
    order by open desc, u.name`);
  return [...rows];
}

// The manager reports. PLAN.md M4 step 4. Each report is one query and a column list,
// so the page, the CSV and the PDF always show the same thing.

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { IsoDate } from "@/lib/dates";
import type { Column, Row } from "./csv";

export type Report = {
  slug: string;
  title: string;
  description: string;
  columns: Column[];
  load: (db: Db, today: IsoDate) => Promise<Row[]>;
};

const CLINICAL = sql`join device_models m on m.id = a.device_model_id and not m.is_test_equipment`;
const LONDON = (column: ReturnType<typeof sql>) => sql`to_char(${column} at time zone 'Europe/London', 'YYYY-MM-DD')`;

async function rows(db: Db, query: ReturnType<typeof sql>): Promise<Row[]> {
  return [...await db.execute<Row>(query)];
}

export const REPORTS: Report[] = [
  {
    slug: "ppm-compliance",
    title: "PPM compliance",
    description: "Share of active PPM schedules that are in date today, by owning department and by device model.",
    columns: [
      { key: "breakdown", label: "By" },
      { key: "name", label: "Name" },
      { key: "schedules", label: "Schedules" },
      { key: "inDate", label: "In date" },
      { key: "overdue", label: "Overdue" },
      { key: "compliance", label: "Compliance %" },
    ],
    load: (db, today) => rows(db, sql`
      with s as (
        select d.name as dept, m.name as model, p.next_due_on >= ${today}::date as in_date
        from ppm_schedules p join assets a on a.id = p.asset_id ${CLINICAL}
        join departments d on d.id = a.owner_department_id
        where p.active and a.lifecycle_status <> 'decommissioned'
      )
      select * from (
        select 'Department' as breakdown, dept as name, count(*)::int as schedules,
               count(*) filter (where in_date)::int as "inDate", count(*) filter (where not in_date)::int as overdue,
               round(100.0 * count(*) filter (where in_date) / count(*), 1)::float8 as compliance
        from s group by dept
        union all
        select 'Model', model, count(*)::int, count(*) filter (where in_date)::int, count(*) filter (where not in_date)::int,
               round(100.0 * count(*) filter (where in_date) / count(*), 1)::float8
        from s group by model
        union all
        select 'All', 'Whole hospital', count(*)::int, count(*) filter (where in_date)::int, count(*) filter (where not in_date)::int,
               round(100.0 * count(*) filter (where in_date) / count(*), 1)::float8
        from s
      ) r
      order by case breakdown when 'All' then 0 when 'Department' then 1 else 2 end, compliance, name`),
  },
  {
    slug: "overdue-ppm",
    title: "Overdue PPM",
    description: "Devices whose PPM is past due. Each one is \"Do not use\" until it is done.",
    columns: [
      { key: "giai", label: "Asset" },
      { key: "model", label: "Model" },
      { key: "owner", label: "Owner" },
      { key: "lastSeen", label: "Last seen" },
      { key: "dueOn", label: "Was due" },
      { key: "daysOverdue", label: "Days overdue" },
      { key: "job", label: "Open job" },
      { key: "assignee", label: "Assigned to" },
    ],
    load: (db, today) => rows(db, sql`
      select a.giai, m.name as model, d.name as owner, r.name as "lastSeen", p.next_due_on::text as "dueOn",
             (${today}::date - p.next_due_on)::int as "daysOverdue", w.number as job, u.name as assignee
      from ppm_schedules p join assets a on a.id = p.asset_id ${CLINICAL}
      join departments d on d.id = a.owner_department_id
      left join asset_current_location l on l.asset_id = a.id left join rooms r on r.id = l.room_id
      left join work_orders w on w.ppm_schedule_id = p.id and w.status in ('open', 'in_progress', 'awaiting_parts')
      left join users u on u.id = w.assignee_id
      where p.active and a.lifecycle_status <> 'decommissioned' and p.next_due_on < ${today}::date
      order by p.next_due_on, a.giai`),
  },
  {
    slug: "failed-tests",
    title: "Failed tests, last 90 days",
    description: "Every safety or performance test that failed in the last 90 days, with the reading and its limits.",
    columns: [
      { key: "on", label: "Date" },
      { key: "job", label: "Job" },
      { key: "giai", label: "Asset" },
      { key: "model", label: "Model" },
      { key: "test", label: "Test" },
      { key: "reading", label: "Reading" },
      { key: "limits", label: "Limits" },
      { key: "outcome", label: "Job outcome" },
      { key: "technician", label: "Technician" },
    ],
    load: (db, today) => rows(db, sql`
      select ${LONDON(sql`r.recorded_at`)} as on, w.number as job, a.giai, m.name as model, i.name as test,
             case when r.measured_value is null then 'Failed check' else r.measured_value::text || coalesce(' ' || r.unit, '') end as reading,
             concat_ws(' to ', r.lower_limit::text, r.upper_limit::text) as limits,
             replace(coalesce(w.outcome::text, w.status::text), '_', ' ') as outcome, u.name as technician
      from test_results r
      join test_template_items i on i.id = r.template_item_id
      join work_orders w on w.id = r.work_order_id
      join assets a on a.id = w.asset_id ${CLINICAL}
      join users u on u.id = r.recorded_by_id
      where r.outcome = 'fail' and r.recorded_at >= ${today}::date - 90
      order by r.recorded_at desc`),
  },
  {
    slug: "mean-time-to-repair",
    title: "Mean time to repair, last 90 days",
    description: "From a fault being raised to the repair job closing, for repairs closed in the last 90 days.",
    columns: [
      { key: "model", label: "Model" },
      { key: "repairs", label: "Repairs closed" },
      { key: "meanDays", label: "Mean days" },
      { key: "medianDays", label: "Median days" },
      { key: "longestDays", label: "Longest days" },
    ],
    load: (db, today) => rows(db, sql`
      with r as (
        select m.name as model, extract(epoch from (w.completed_at - w.created_at)) / 86400 as days
        from work_orders w join assets a on a.id = w.asset_id ${CLINICAL}
        where w.type = 'repair' and w.status = 'completed' and w.completed_at >= ${today}::date - 90
      )
      select * from (
        select 'All models' as model, count(*)::int as repairs, round(avg(days)::numeric, 1)::float8 as "meanDays",
               round((percentile_cont(0.5) within group (order by days))::numeric, 1)::float8 as "medianDays",
               round(max(days)::numeric, 1)::float8 as "longestDays", 0 as sort
        from r
        union all
        select model, count(*)::int, round(avg(days)::numeric, 1)::float8,
               round((percentile_cont(0.5) within group (order by days))::numeric, 1)::float8, round(max(days)::numeric, 1)::float8, 1
        from r group by model
      ) x order by sort, "meanDays" desc`),
  },
  {
    slug: "end-of-life",
    title: "Past end of life",
    description: "Devices still in the register after their expected end-of-life date. A decision to replace or extend is due.",
    columns: [
      { key: "giai", label: "Asset" },
      { key: "model", label: "Model" },
      { key: "owner", label: "Owner" },
      { key: "purchaseDate", label: "Bought" },
      { key: "endOfLife", label: "End of life" },
      { key: "monthsPast", label: "Months past" },
      { key: "status", label: "Lifecycle" },
    ],
    load: (db, today) => rows(db, sql`
      select a.giai, m.name as model, d.name as owner, a.purchase_date::text as "purchaseDate",
             a.end_of_life_date::text as "endOfLife",
             ((extract(year from age(${today}::date, a.end_of_life_date)) * 12) + extract(month from age(${today}::date, a.end_of_life_date)))::int as "monthsPast",
             replace(a.lifecycle_status::text, '_', ' ') as status
      from assets a ${CLINICAL} join departments d on d.id = a.owner_department_id
      where a.lifecycle_status <> 'decommissioned' and a.end_of_life_date < ${today}::date
      order by a.end_of_life_date, a.giai`),
  },
  {
    slug: "open-notices",
    title: "Open safety notices",
    description: "Safety notices not yet closed, with how many matched devices are still waiting for action.",
    columns: [
      { key: "reference", label: "Reference" },
      { key: "title", label: "Title" },
      { key: "deadline", label: "Action by" },
      { key: "matched", label: "Matched" },
      { key: "done", label: "Done" },
      { key: "waiting", label: "Waiting" },
      { key: "pastDeadline", label: "Past deadline" },
    ],
    load: (db, today) => rows(db, sql`
      select n.reference, n.title, n.deadline::text as deadline,
             count(sm.id)::int as matched, count(sm.id) filter (where sm.status <> 'open')::int as done,
             count(sm.id) filter (where sm.status = 'open')::int as waiting,
             n.deadline < ${today}::date as "pastDeadline"
      from safety_notices n left join safety_notice_matches sm on sm.notice_id = n.id
      where n.status = 'open'
      group by n.id order by n.deadline`),
  },
];

export function findReport(slug: string): Report | null {
  return REPORTS.find((r) => r.slug === slug) ?? null;
}

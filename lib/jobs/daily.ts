// The daily job. PLAN.md M3 step 4, M4 step 1 and section 3.4.
// 1. Adds today's EM score for every device model (once a day).
// 2. Opens a PPM job for every active schedule due within 14 days (or overdue) that has none.
// 3. Re-sets the priority of open PPM jobs from the latest EM score and whether they are overdue.
// It is idempotent: a second run the same day changes nothing.

import { sql } from "drizzle-orm";
import { withUser, type Db, type Tx } from "@/db/client";
import { workOrders } from "@/db/schema";
import { LATEST_EM, recalculateEmScores } from "@/lib/data/em";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import { addDays, type IsoDate } from "@/lib/dates";
import { DUE_SOON_DAYS, isOverdue } from "@/lib/rules/ppm";
import { ppmPriority, type Priority } from "@/lib/rules/priority";

export type DailyResult = { emScored: number; created: string[]; reprioritised: number };

export async function runDailyJob(db: Db, today: IsoDate): Promise<DailyResult> {
  return withUser(db, SYSTEM_USER_ID, (tx) => runDailyJobIn(tx, today));
}

/**
 * The job itself, inside a transaction already attributed to the system user.
 * `at` stamps the scores and jobs it adds; it defaults to the database clock.
 */
export async function runDailyJobIn(tx: Tx, today: IsoDate, at?: Date): Promise<DailyResult> {
  {
    // Only one daily run at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('medasset:daily-job'))`);

    // Scores first, so today's priorities use today's scores.
    const emScored = await recalculateEmScores(tx, today, { at });

    const due = await tx.execute<{ scheduleId: string; assetId: string; nextDueOn: string; templateId: string; em: number }>(sql`
      select p.id as "scheduleId", p.asset_id as "assetId", p.next_due_on::text as "nextDueOn",
             m.test_template_id as "templateId", ${LATEST_EM("m")} as em
      from ppm_schedules p
      join assets a on a.id = p.asset_id
      join device_models m on m.id = a.device_model_id
      where p.active and a.lifecycle_status <> 'decommissioned'
        and p.next_due_on <= ${addDays(today, DUE_SOON_DAYS)}::date
        and not exists (
          select 1 from work_orders w
          where w.ppm_schedule_id = p.id and w.status in ('open', 'in_progress', 'awaiting_parts'))
      order by p.next_due_on, a.giai`);

    // Spread new jobs over the technicians with the fewest open jobs.
    const load = [...await tx.execute<{ id: string; open: number }>(sql`
      select u.id, (select count(*)::int from work_orders w where w.assignee_id = u.id and w.status in ('open', 'in_progress', 'awaiting_parts')) as open
      from users u where u.active and u.role = 'technician' order by u.name`)];

    const created: string[] = [];
    for (const d of due) {
      const tech = load.length ? load.reduce((a, b) => (b.open < a.open ? b : a)) : null;
      const [job] = await tx.insert(workOrders).values({
        type: "ppm", status: "open", priority: ppmPriority(d.em, isOverdue(d.nextDueOn, today)),
        assetId: d.assetId, ppmScheduleId: d.scheduleId, testTemplateId: d.templateId,
        assigneeId: tech?.id ?? null, reportedById: SYSTEM_USER_ID, dueOn: d.nextDueOn, createdAt: at,
      }).onConflictDoNothing().returning({ number: workOrders.number });
      if (job) {
        created.push(job.number);
        if (tech) tech.open++;
      }
    }

    const open = await tx.execute<{ id: string; priority: Priority; dueOn: string; em: number }>(sql`
      select w.id, w.priority, w.due_on::text as "dueOn",
             ${LATEST_EM("m")} as em
      from work_orders w
      join assets a on a.id = w.asset_id
      join device_models m on m.id = a.device_model_id
      where w.type = 'ppm' and w.status in ('open', 'in_progress', 'awaiting_parts') and w.due_on is not null`);
    let reprioritised = 0;
    for (const job of open) {
      const priority = ppmPriority(job.em, isOverdue(job.dueOn, today));
      if (priority !== job.priority) {
        await tx.execute(sql`update work_orders set priority = ${priority} where id = ${job.id}`);
        reprioritised++;
      }
    }
    return { emScored, created, reprioritised };
  }
}

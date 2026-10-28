// Work orders: the job queue, the PPM checklist and closing jobs.
// Callers check permissions first; every write here runs inside the caller's audited transaction.

import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { assets, partsUsed, ppmSchedules, safetyNoticeMatches, testResults, workOrders, type InspectionRecord } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/users";
import { getAssetSummary, UUID } from "@/lib/data/assets";
import type { IsoDate } from "@/lib/dates";
import type { DisplayStatus } from "@/lib/rules/assetStatus";
import { repairPriority } from "@/lib/rules/priority";
import { measurementOutcome } from "@/lib/rules/testResult";
import {
  closeBlockers, closeEffects, failedItems, OPEN_STATUSES, type Blocker, type CloseOutcome,
  type LifecycleStatus, type WorkOrderStatus, type WorkOrderType,
} from "@/lib/rules/workOrder";

type Reader = Db | Tx;

const LONDON_TIME = (column: SQL) => sql`to_char(${column} at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI')`;
const PRIORITY_RANK = sql`array_position(array['critical','high','normal','low']::work_order_priority[], w.priority)`;
const OPEN = sql`('open', 'in_progress', 'awaiting_parts')`;

/** A message the person can act on, as opposed to a bug. */
export class JobError extends Error {}

// ---------- the queue ----------

export type QueueRow = {
  id: string;
  number: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: "critical" | "high" | "normal" | "low";
  dueOn: string | null;
  createdAt: string;
  faultReason: string | null;
  assetId: string;
  giai: string;
  modelName: string;
  roomName: string | null;
  floorLabel: string | null;
  display: DisplayStatus;
  assigneeName: string | null;
};

/** Open jobs, highest priority first, then by due date. `assigneeId: null` lists unassigned jobs. */
export async function listOpenJobs(db: Reader, assigneeId: string | null, today: IsoDate): Promise<QueueRow[]> {
  const who = assigneeId === null ? sql`w.assignee_id is null` : sql`w.assignee_id = ${assigneeId}`;
  const rows = await db.execute<QueueRow>(sql`
    select w.id, w.number, w.type, w.status, w.priority, w.due_on::text as "dueOn",
           ${LONDON_TIME(sql`w.created_at`)} as "createdAt", w.fault_reason as "faultReason",
           a.id as "assetId", a.giai, m.name as "modelName", r.name as "roomName",
           b.name || ', ' || f.name as "floorLabel", s.display_status as display, u.name as "assigneeName"
    from work_orders w
    join assets a on a.id = w.asset_id
    join device_models m on m.id = a.device_model_id
    join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
    left join asset_current_location l on l.asset_id = a.id
    left join rooms r on r.id = l.room_id
    left join floors f on f.id = r.floor_id
    left join buildings b on b.id = f.building_id
    left join users u on u.id = w.assignee_id
    where w.status in ${OPEN} and ${who}
    order by ${PRIORITY_RANK}, w.due_on nulls last, w.created_at`);
  return [...rows];
}

export async function listTechnicians(db: Reader) {
  const rows = await db.execute<{ id: string; name: string; role: string; openJobs: number }>(sql`
    select u.id, u.name, u.role,
           (select count(*)::int from work_orders w where w.assignee_id = u.id and w.status in ${OPEN}) as "openJobs"
    from users u
    where u.active and u.role in ('technician', 'manager')
    order by u.role desc, u.name`);
  return [...rows];
}

// ---------- one job ----------

export type JobItem = {
  id: string;
  position: number;
  code: string;
  name: string;
  group: "inspection" | "calibration" | "electrical_safety" | "performance";
  kind: "measurement" | "check";
  unit: string | null;
  lower: number | null;
  upper: number | null;
  required: boolean;
  requiresAnalyser: boolean;
};

export type JobResult = {
  templateItemId: string;
  phase: "before" | "after";
  outcome: "pass" | "fail" | "not_applicable";
  value: string | null;
  analyserAssetId: string | null;
  recordedAt: string;
};

export async function getJob(db: Reader, id: string, today: IsoDate) {
  if (!UUID.test(id)) return null;
  const [wo] = await db.execute<{
    id: string; number: string; type: WorkOrderType; status: WorkOrderStatus; priority: QueueRow["priority"];
    assetId: string; assigneeId: string | null; assigneeName: string | null; reportedByName: string;
    faultReason: string | null; inspection: InspectionRecord | null; calibrationNotes: string | null;
    outcome: CloseOutcome | null; dueOn: string | null; createdAt: string; startedAt: string | null;
    completedAt: string | null; closedByName: string | null; testTemplateId: string | null; templateName: string | null;
    ppmScheduleId: string | null; safetyNoticeMatchId: string | null; actionNotes: string | null;
    noticeId: string | null; noticeReference: string | null; noticeTitle: string | null; noticeAction: string | null;
  }>(sql`
    select w.id, w.number, w.type, w.status, w.priority, w.asset_id as "assetId", w.assignee_id as "assigneeId",
           ua.name as "assigneeName", ur.name as "reportedByName", w.fault_reason as "faultReason", w.inspection,
           w.calibration_notes as "calibrationNotes", w.outcome, w.due_on::text as "dueOn",
           ${LONDON_TIME(sql`w.created_at`)} as "createdAt", ${LONDON_TIME(sql`w.started_at`)} as "startedAt",
           ${LONDON_TIME(sql`w.completed_at`)} as "completedAt", uc.name as "closedByName",
           w.test_template_id as "testTemplateId", t.name || ' (v' || t.version || ')' as "templateName",
           w.ppm_schedule_id as "ppmScheduleId", w.safety_notice_match_id as "safetyNoticeMatchId", w.action_notes as "actionNotes",
           n.id as "noticeId", n.reference as "noticeReference", n.title as "noticeTitle", n.required_action as "noticeAction"
    from work_orders w
    join users ur on ur.id = w.reported_by_id
    left join users ua on ua.id = w.assignee_id
    left join users uc on uc.id = w.closed_by_id
    left join test_templates t on t.id = w.test_template_id
    left join safety_notice_matches sm on sm.id = w.safety_notice_match_id
    left join safety_notices n on n.id = sm.notice_id
    where w.id = ${id}`);
  if (!wo) return null;

  const [asset, items, results, parts, analysers] = await Promise.all([
    getAssetSummary(db, wo.assetId, today),
    db.execute<JobItem>(sql`
      select id, position, code, name, "group", kind, unit, lower_limit::float8 as lower, upper_limit::float8 as upper,
             required, requires_analyser as "requiresAnalyser"
      from test_template_items where template_id = ${wo.testTemplateId} order by position`),
    db.execute<JobResult>(sql`
      select template_item_id as "templateItemId", phase, outcome, measured_value::text as value,
             analyser_asset_id as "analyserAssetId", ${LONDON_TIME(sql`recorded_at`)} as "recordedAt"
      from test_results where work_order_id = ${id}`),
    db.execute<{ id: string; partNumber: string; description: string; supplier: string; lotNumber: string | null; quantity: number }>(sql`
      select id, part_number as "partNumber", description, supplier, lot_number as "lotNumber", quantity
      from parts_used where work_order_id = ${id} order by recorded_at`),
    listAnalysers(db, today),
  ]);
  return { ...wo, asset: asset!, items: [...items], results: [...results], parts: [...parts], analysers };
}

export type Job = NonNullable<Awaited<ReturnType<typeof getJob>>>;

/** Test equipment, with whether each is itself safe to use. */
export async function listAnalysers(db: Reader, today: IsoDate) {
  const rows = await db.execute<{ id: string; giai: string; name: string; doNotUse: boolean }>(sql`
    select a.id, a.giai, m.name, s.do_not_use as "doNotUse"
    from assets a
    join device_models m on m.id = a.device_model_id and m.is_test_equipment
    join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
    where a.lifecycle_status <> 'decommissioned'
    order by a.giai`);
  return [...rows];
}

// ---------- writes ----------

/** Loads a job for writing, locked, and checks this person may work on it. */
async function lockJob(tx: Tx, id: string, user: CurrentUser) {
  if (!UUID.test(id)) throw new JobError("Unknown job.");
  const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, id)).for("update");
  if (!wo) throw new JobError("Unknown job.");
  if (!OPEN_STATUSES.includes(wo.status)) throw new JobError(`${wo.number} is closed and cannot be changed.`);
  if (wo.assigneeId && wo.assigneeId !== user.id && !can(user, "workorder.assign")) {
    throw new JobError(`${wo.number} is assigned to someone else.`);
  }
  return wo;
}

/** Working on an open job starts it: in progress, started now, and assigned to you if unassigned. */
async function ensureStarted(tx: Tx, wo: typeof workOrders.$inferSelect, user: CurrentUser) {
  if (wo.status !== "open") return;
  await tx.update(workOrders).set({
    status: "in_progress",
    startedAt: wo.startedAt ?? new Date(),
    assigneeId: wo.assigneeId ?? user.id,
  }).where(eq(workOrders.id, wo.id));
  // Taking in a repair takes the device out of service.
  if (wo.type === "repair") {
    await tx.update(assets).set({ lifecycleStatus: "under_repair", inUse: false })
      .where(and(eq(assets.id, wo.assetId), eq(assets.lifecycleStatus, "in_service")));
  }
}

export async function startJob(tx: Tx, id: string, user: CurrentUser) {
  const wo = await lockJob(tx, id, user);
  if (wo.status === "awaiting_parts") {
    await tx.update(workOrders).set({ status: "in_progress" }).where(eq(workOrders.id, id));
  } else {
    await ensureStarted(tx, wo, user);
  }
}

export async function markAwaitingParts(tx: Tx, id: string, user: CurrentUser) {
  const wo = await lockJob(tx, id, user);
  await ensureStarted(tx, wo, user);
  await tx.update(workOrders).set({ status: "awaiting_parts" }).where(eq(workOrders.id, id));
}

export async function assignJob(tx: Tx, id: string, user: CurrentUser, assigneeId: string) {
  await lockJob(tx, id, user);
  const [tech] = await tx.execute<{ id: string }>(sql`
    select id from users where id = ${assigneeId} and active and role in ('technician', 'manager')`);
  if (!tech) throw new JobError("Choose an active technician.");
  await tx.update(workOrders).set({ assigneeId }).where(eq(workOrders.id, id));
}

export async function saveInspection(
  tx: Tx, id: string, user: CurrentUser,
  input: { inspection: InspectionRecord; calibrationNotes: string | null },
) {
  const wo = await lockJob(tx, id, user);
  await ensureStarted(tx, wo, user);
  await tx.update(workOrders).set({ inspection: input.inspection, calibrationNotes: input.calibrationNotes })
    .where(eq(workOrders.id, id));
}

export type ResultEntry =
  | { itemId: string; kind: "measurement"; value: string }
  | { itemId: string; kind: "check"; outcome: "pass" | "fail" | "not_applicable" };

/**
 * Records "after" results. Measurement outcomes are worked out here from the limits,
 * never taken from the form. Entering a result again replaces it (the old value stays in the audit log).
 * A result sent again unchanged is left alone, so its recorded time and the audit log stay true.
 * Returns how many results were new or changed.
 */
export async function saveResults(
  tx: Tx, id: string, user: CurrentUser, entries: ResultEntry[], analyserAssetId: string | null,
): Promise<number> {
  const wo = await lockJob(tx, id, user);
  if (!wo.testTemplateId) throw new JobError("This job has no test template.");
  const items = new Map((await tx.execute<JobItem>(sql`
    select id, name, kind, unit, lower_limit::float8 as lower, upper_limit::float8 as upper, required,
           requires_analyser as "requiresAnalyser"
    from test_template_items where template_id = ${wo.testTemplateId}`)).map((i) => [i.id, i]));

  if (analyserAssetId) {
    const [analyser] = await tx.execute<{ id: string }>(sql`
      select a.id from assets a join device_models m on m.id = a.device_model_id and m.is_test_equipment
      where a.id = ${analyserAssetId}`);
    if (!analyser) throw new JobError("That is not a test analyser.");
  }

  await ensureStarted(tx, wo, user);
  let changed = 0;
  for (const entry of entries) {
    const item = items.get(entry.itemId);
    if (!item || item.kind !== entry.kind) throw new JobError("That test is not part of this job.");
    let measuredValue: string | null = null;
    let outcome: "pass" | "fail" | "not_applicable";
    if (entry.kind === "measurement") {
      const value = Number(entry.value.trim().replace(",", "."));
      if (!entry.value.trim() || !Number.isFinite(value)) throw new JobError(`Enter a number for "${item.name}".`);
      if (item.requiresAnalyser && !analyserAssetId) throw new JobError(`Choose the test analyser used for "${item.name}".`);
      measuredValue = String(value);
      outcome = measurementOutcome(value, item.lower, item.upper);
    } else {
      if (entry.outcome === "not_applicable" && item.required) throw new JobError(`"${item.name}" is required and cannot be not applicable.`);
      outcome = entry.outcome;
    }
    const values = {
      measuredValue, outcome, unit: item.unit,
      lowerLimit: item.lower === null ? null : String(item.lower),
      upperLimit: item.upper === null ? null : String(item.upper),
      analyserAssetId: item.requiresAnalyser && outcome !== "not_applicable" ? analyserAssetId : null,
      recordedById: user.id, recordedAt: new Date(),
    };
    const written = await tx.insert(testResults)
      .values({ workOrderId: id, templateItemId: item.id, phase: "after", ...values })
      .onConflictDoUpdate({
        target: [testResults.workOrderId, testResults.templateItemId, testResults.phase],
        set: values,
        setWhere: sql`(${testResults.measuredValue}, ${testResults.outcome}, ${testResults.analyserAssetId})
          is distinct from (excluded.measured_value, excluded.outcome, excluded.analyser_asset_id)`,
      })
      .returning({ id: testResults.id });
    changed += written.length;
  }
  return changed;
}

/** Recall jobs: what was done for the safety notice (needed before the job can close). */
export async function saveActionNotes(tx: Tx, id: string, user: CurrentUser, notes: string) {
  const wo = await lockJob(tx, id, user);
  if (wo.type !== "recall") throw new JobError("Only recall jobs record a safety notice action.");
  await ensureStarted(tx, wo, user);
  await tx.update(workOrders).set({ actionNotes: notes.trim().slice(0, 2000) || null }).where(eq(workOrders.id, id));
}

export async function addPart(
  tx: Tx, id: string, user: CurrentUser,
  part: { partNumber: string; description: string; supplier: string; lotNumber: string | null; quantity: number },
) {
  const wo = await lockJob(tx, id, user);
  await ensureStarted(tx, wo, user);
  await tx.insert(partsUsed).values({ workOrderId: id, ...part, recordedById: user.id });
}

export type CloseResult =
  | { ok: true; outcome: CloseOutcome; followUp: string | null }
  | { ok: false; blockers: Blocker[] };

/** Closes a job if the rules allow, and applies what closing means for the device. */
export async function closeJob(
  tx: Tx, id: string, user: CurrentUser,
  input: { choice?: "no_fault_found" | "beyond_economic_repair"; today: IsoDate },
): Promise<CloseResult> {
  const wo = await lockJob(tx, id, user);
  const [asset] = await tx.select().from(assets).where(eq(assets.id, wo.assetId)).for("update");
  const [model] = await tx.execute<{ intervalMonths: number; category: string; templateId: string }>(sql`
    select ppm_interval_months as "intervalMonths", category, test_template_id as "templateId"
    from device_models where id = ${asset.deviceModelId}`);
  const items = wo.testTemplateId ? [...await tx.execute<JobItem>(sql`
    select id, name, required, requires_analyser as "requiresAnalyser" from test_template_items
    where template_id = ${wo.testTemplateId}`)] : [];
  const results = [...await tx.execute<{ templateItemId: string; phase: "before" | "after"; outcome: "pass" | "fail" | "not_applicable"; analyserAssetId: string | null }>(sql`
    select template_item_id as "templateItemId", phase, outcome, analyser_asset_id as "analyserAssetId"
    from test_results where work_order_id = ${id}`)];
  const unusable = (await listAnalysers(tx, input.today)).filter((a) => a.doNotUse).map((a) => a.id);

  const blockers = closeBlockers({
    type: wo.type, status: wo.status, inspection: wo.inspection ?? null, items, results,
    unusableAnalyserIds: unusable, choice: input.choice, actionNotes: wo.actionNotes,
  });
  if (blockers.length > 0) return { ok: false, blockers };

  const [schedule] = await tx.select().from(ppmSchedules).where(eq(ppmSchedules.assetId, asset.id));
  const [otherRepair] = await tx.select({ id: workOrders.id }).from(workOrders).where(and(
    eq(workOrders.assetId, asset.id), eq(workOrders.type, "repair"), ne(workOrders.id, id),
    sql`${workOrders.status} in ${OPEN}`,
  )).limit(1);

  const effects = closeEffects({
    type: wo.type, choice: input.choice, failed: failedItems({ items, results }), today: input.today,
    intervalMonths: model.intervalMonths, hasSchedule: !!schedule,
    currentLifecycle: asset.lifecycleStatus as LifecycleStatus, otherOpenRepair: !!otherRepair,
  });

  const now = new Date();
  await tx.update(workOrders).set({
    status: "completed", outcome: effects.outcome, completedAt: now, closedById: user.id,
    startedAt: wo.startedAt ?? now, assigneeId: wo.assigneeId ?? user.id,
  }).where(eq(workOrders.id, id));

  await tx.update(assets).set({
    lifecycleStatus: effects.lifecycle,
    ...(effects.lifecycle !== "in_service" ? { inUse: false } : {}),
    ...(effects.setAcceptedNow ? { acceptedAt: now } : {}),
    ...(effects.setDecommissionedNow ? { decommissionedAt: now } : {}),
  }).where(eq(assets.id, asset.id));

  if (effects.createSchedule && effects.schedule) {
    await tx.insert(ppmSchedules).values({ assetId: asset.id, intervalMonths: model.intervalMonths, ...effects.schedule });
  } else if (schedule && effects.schedule) {
    await tx.update(ppmSchedules).set(effects.schedule).where(eq(ppmSchedules.id, schedule.id));
  }
  if (schedule && effects.deactivateSchedule) {
    await tx.update(ppmSchedules).set({ active: false }).where(eq(ppmSchedules.id, schedule.id));
  }
  if (effects.markMatchActioned && wo.safetyNoticeMatchId) {
    await tx.update(safetyNoticeMatches).set({ status: "actioned", actionedAt: now, actionedById: user.id })
      .where(eq(safetyNoticeMatches.id, wo.safetyNoticeMatchId));
  }

  let followUp: string | null = null;
  if (effects.followUpRepair) {
    const [repair] = await tx.insert(workOrders).values({
      type: "repair", status: "open", priority: repairPriority(model.category), assetId: asset.id,
      testTemplateId: model.templateId, assigneeId: wo.assigneeId ?? user.id, reportedById: user.id,
      faultReason: effects.followUpRepair,
    }).returning({ number: workOrders.number });
    followUp = repair.number;
  }
  return { ok: true, outcome: effects.outcome, followUp };
}

// ---------- labels ----------

/** What the return-to-use label needs about a job. */
export async function getLabelJob(db: Reader, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db.execute<{
    number: string; type: WorkOrderType; status: WorkOrderStatus; outcome: CloseOutcome | null;
    completedOn: string | null; technicianInitials: string | null; giai: string; modelName: string; nextDueOn: string | null;
  }>(sql`
    select w.number, w.type, w.status, w.outcome,
           to_char(w.completed_at at time zone 'Europe/London', 'YYYY-MM-DD') as "completedOn",
           u.initials as "technicianInitials", a.giai, m.name as "modelName",
           (select p.next_due_on::text from ppm_schedules p where p.asset_id = a.id and p.active) as "nextDueOn"
    from work_orders w
    join assets a on a.id = w.asset_id
    join device_models m on m.id = a.device_model_id
    left join users u on u.id = w.closed_by_id
    where w.id = ${id}`);
  return row ?? null;
}

// ---------- ward fault reports ----------

export const FAULT_REASONS = [
  "Will not power on",
  "Alarm fault",
  "Display fault",
  "Battery not charging",
  "Damaged or cracked",
  "Dropped",
  "Fluid spill",
  "Missing or damaged accessory",
] as const;

export type FaultReport = { ok: true; number: string; alreadyReported: boolean } | { ok: false; message: string };

/**
 * A ward fault report: an unassigned repair job, which makes the device "Do not use"
 * until it is reviewed (FAULT_REPORTED). A second report on the same device joins the first.
 */
export async function reportFault(tx: Tx, user: CurrentUser, assetId: string, reason: string): Promise<FaultReport> {
  if (!UUID.test(assetId)) return { ok: false, message: "Choose a device." };
  const [asset] = await tx.select().from(assets).where(eq(assets.id, assetId)).for("update");
  if (!asset) return { ok: false, message: "Choose a device." };
  if (asset.lifecycleStatus === "decommissioned") return { ok: false, message: "That device has been decommissioned." };

  const [existing] = await tx.select({ number: workOrders.number }).from(workOrders).where(and(
    eq(workOrders.assetId, assetId), eq(workOrders.type, "repair"), sql`${workOrders.status} in ${OPEN}`,
  )).limit(1);
  if (existing) return { ok: true, number: existing.number, alreadyReported: true };

  const [model] = await tx.execute<{ category: string; templateId: string }>(sql`
    select category, test_template_id as "templateId" from device_models where id = ${asset.deviceModelId}`);
  const [job] = await tx.insert(workOrders).values({
    type: "repair", status: "open", priority: repairPriority(model.category), assetId,
    testTemplateId: model.templateId, reportedById: user.id, faultReason: reason.trim().slice(0, 200),
  }).returning({ number: workOrders.number });
  // A faulty device comes out of use straight away.
  if (asset.inUse) await tx.update(assets).set({ inUse: false }).where(eq(assets.id, assetId));
  return { ok: true, number: job.number, alreadyReported: false };
}

/** Devices last seen in the reporter's own department's rooms, for one-tap picking. */
export async function devicesInDepartment(db: Reader, departmentName: string | null, today: IsoDate) {
  if (!departmentName) return [];
  const rows = await db.execute<{ id: string; giai: string; modelName: string; roomName: string; display: DisplayStatus }>(sql`
    select a.id, a.giai, m.name as "modelName", r.name as "roomName", s.display_status as display
    from assets a
    join device_models m on m.id = a.device_model_id and not m.is_test_equipment
    join asset_current_location l on l.asset_id = a.id
    join rooms r on r.id = l.room_id
    join departments d on d.id = r.department_id and d.name = ${departmentName}
    join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
    where a.lifecycle_status <> 'decommissioned'
    order by r.name, m.name, a.giai`);
  return [...rows];
}

// Safety notices: National Patient Safety Alerts, MHRA safety messages and manufacturers'
// Field Safety Notices. Saving one matches every affected device and opens a recall job for
// each; the notice is tracked until every match is actioned or found not affected.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { safetyNoticeCriteria, safetyNoticeMatches, safetyNotices, workOrders } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/users";
import { UUID } from "@/lib/data/assets";
import { JobError } from "@/lib/data/workOrders";
import type { IsoDate } from "@/lib/dates";
import { canCloseNotice, criterionProblems, matchingCriterion, type NoticeCriterion } from "@/lib/rules/notices";

type Reader = Db | Tx;

export type NoticeSource = "natpsa" | "mhra_dsi" | "fsn";
export const SOURCE_TEXT: Record<NoticeSource, string> = {
  natpsa: "National Patient Safety Alert",
  mhra_dsi: "MHRA Device Safety Information",
  fsn: "Field Safety Notice",
};

export type NoticeInput = {
  reference: string;
  source: NoticeSource;
  title: string;
  description: string;
  requiredAction: string;
  issuedOn: IsoDate;
  deadline: IsoDate;
  quarantineRequired: boolean;
  criteria: NoticeCriterion[];
};

export type NoticeRow = {
  id: string;
  reference: string;
  source: NoticeSource;
  title: string;
  deadline: string;
  issuedOn: string;
  status: "open" | "closed";
  quarantineRequired: boolean;
  matched: number;
  waiting: number;
  overdue: boolean;
};

export async function listNotices(db: Reader, today: IsoDate): Promise<NoticeRow[]> {
  const rows = await db.execute<NoticeRow>(sql`
    select n.id, n.reference, n.source, n.title, n.deadline::text as deadline, n.issued_on::text as "issuedOn",
           n.status, n.quarantine_required as "quarantineRequired",
           (select count(*)::int from safety_notice_matches m where m.notice_id = n.id) as matched,
           (select count(*)::int from safety_notice_matches m where m.notice_id = n.id and m.status = 'open') as waiting,
           (n.status = 'open' and n.deadline < ${today}::date) as overdue
    from safety_notices n
    order by n.status, n.deadline, n.reference`);
  return [...rows];
}

export async function getNotice(db: Reader, id: string) {
  if (!UUID.test(id)) return null;
  const [notice] = await db.execute<{
    id: string; reference: string; source: NoticeSource; title: string; description: string; requiredAction: string;
    issuedOn: string; deadline: string; quarantineRequired: boolean; status: "open" | "closed"; createdBy: string;
    createdAt: string; closedAt: string | null;
  }>(sql`
    select n.id, n.reference, n.source, n.title, n.description, n.required_action as "requiredAction",
           n.issued_on::text as "issuedOn", n.deadline::text as deadline, n.quarantine_required as "quarantineRequired",
           n.status, u.name as "createdBy",
           to_char(n.created_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as "createdAt",
           to_char(n.closed_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as "closedAt"
    from safety_notices n join users u on u.id = n.created_by_id where n.id = ${id}`);
  if (!notice) return null;
  const [criteria, matches] = await Promise.all([
    db.execute<{ id: string; modelName: string; serialFrom: string | null; serialTo: string | null; firmwareVersions: string[] | null }>(sql`
      select c.id, m.name as "modelName", c.serial_from as "serialFrom", c.serial_to as "serialTo", c.firmware_versions as "firmwareVersions"
      from safety_notice_criteria c join device_models m on m.id = c.device_model_id where c.notice_id = ${id}`),
    db.execute<{
      id: string; status: "open" | "actioned" | "not_affected"; assetId: string; giai: string; serialNumber: string;
      firmwareVersion: string | null; modelName: string; roomAtMatch: string | null; roomNow: string | null;
      jobId: string | null; jobNumber: string | null; jobStatus: string | null; actionNotes: string | null;
      actionedAt: string | null; actionedBy: string | null;
    }>(sql`
      select sm.id, sm.status, a.id as "assetId", a.giai, a.serial_number as "serialNumber", a.firmware_version as "firmwareVersion",
             m.name as "modelName", rm.name as "roomAtMatch", rn.name as "roomNow",
             w.id as "jobId", w.number as "jobNumber", w.status as "jobStatus", w.action_notes as "actionNotes",
             to_char(sm.actioned_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as "actionedAt", u.name as "actionedBy"
      from safety_notice_matches sm
      join assets a on a.id = sm.asset_id
      join device_models m on m.id = a.device_model_id
      left join rooms rm on rm.id = sm.room_id_at_match
      left join asset_current_location l on l.asset_id = a.id
      left join rooms rn on rn.id = l.room_id
      left join work_orders w on w.safety_notice_match_id = sm.id and w.type = 'recall'
      left join users u on u.id = sm.actioned_by_id
      where sm.notice_id = ${id}
      order by sm.status, m.name, a.giai`),
  ]);
  return { ...notice, criteria: [...criteria], matches: [...matches] };
}

export type Notice = NonNullable<Awaited<ReturnType<typeof getNotice>>>;

/** Saves a notice, matches every affected device, and opens a recall job for each. */
export async function createNotice(tx: Tx, user: CurrentUser, input: NoticeInput): Promise<{ id: string; matched: number }> {
  if (input.criteria.length === 0) throw new JobError("Add at least one affected device model.");
  if (input.deadline < input.issuedOn) throw new JobError("The deadline is before the issue date.");
  const problems = input.criteria.flatMap(criterionProblems);
  if (problems.length) throw new JobError(problems.join(" "));
  const [duplicate] = await tx.select({ id: safetyNotices.id }).from(safetyNotices).where(eq(safetyNotices.reference, input.reference));
  if (duplicate) throw new JobError(`A notice with the reference ${input.reference} is already logged.`);

  const [notice] = await tx.insert(safetyNotices).values({
    reference: input.reference, source: input.source, title: input.title, description: input.description,
    requiredAction: input.requiredAction, issuedOn: input.issuedOn, deadline: input.deadline,
    quarantineRequired: input.quarantineRequired, createdById: user.id,
  }).returning({ id: safetyNotices.id });

  const criteria = await tx.insert(safetyNoticeCriteria).values(input.criteria.map((c) => ({
    noticeId: notice.id, deviceModelId: c.deviceModelId, serialFrom: c.serialFrom || null, serialTo: c.serialTo || null,
    firmwareVersions: c.firmwareVersions?.length ? c.firmwareVersions : null,
  }))).returning();

  // Match in TypeScript with the tested rules, over the candidate models' devices.
  const candidates = await tx.execute<{ id: string; deviceModelId: string; serialNumber: string; firmwareVersion: string | null; roomId: string | null }>(sql`
    select a.id, a.device_model_id as "deviceModelId", a.serial_number as "serialNumber", a.firmware_version as "firmwareVersion",
           l.room_id as "roomId"
    from assets a left join asset_current_location l on l.asset_id = a.id
    where a.lifecycle_status <> 'decommissioned'
      and a.device_model_id in ${[...new Set(input.criteria.map((c) => c.deviceModelId))]}`);

  let matched = 0;
  for (const device of candidates) {
    const criterion = matchingCriterion(device, criteria.map((c) => ({ ...c, firmwareVersions: c.firmwareVersions ?? null })));
    if (!criterion) continue;
    const [match] = await tx.insert(safetyNoticeMatches).values({
      noticeId: notice.id, criteriaId: criterion.id, assetId: device.id, roomIdAtMatch: device.roomId,
    }).returning({ id: safetyNoticeMatches.id });
    await tx.insert(workOrders).values({
      type: "recall", status: "open", priority: input.quarantineRequired ? "high" : "normal", assetId: device.id,
      safetyNoticeMatchId: match.id, reportedById: user.id, dueOn: input.deadline,
      faultReason: `${input.reference}: ${input.requiredAction}`.slice(0, 200),
    });
    matched++;
  }
  return { id: notice.id, matched };
}

/** A matched device found not to be affected after all: the match closes and its recall job is cancelled. */
export async function markNotAffected(tx: Tx, user: CurrentUser, matchId: string, reason: string) {
  if (!UUID.test(matchId)) throw new JobError("Unknown device.");
  const [match] = await tx.select().from(safetyNoticeMatches).where(eq(safetyNoticeMatches.id, matchId)).for("update");
  if (!match || match.status !== "open") throw new JobError("That device is no longer waiting for action.");
  const now = new Date();
  await tx.update(safetyNoticeMatches).set({ status: "not_affected", actionedAt: now, actionedById: user.id })
    .where(eq(safetyNoticeMatches.id, matchId));
  await tx.update(workOrders).set({ status: "cancelled", actionNotes: `Not affected: ${reason}`.slice(0, 2000), closedById: user.id, completedAt: now })
    .where(and(eq(workOrders.safetyNoticeMatchId, matchId), inArray(workOrders.status, ["open", "in_progress", "awaiting_parts"])));
}

export async function closeNotice(tx: Tx, noticeId: string) {
  const [notice] = await tx.select().from(safetyNotices).where(eq(safetyNotices.id, noticeId)).for("update");
  if (!notice) throw new JobError("Unknown notice.");
  if (notice.status === "closed") throw new JobError("This notice is already closed.");
  const statuses = (await tx.select({ status: safetyNoticeMatches.status }).from(safetyNoticeMatches)
    .where(eq(safetyNoticeMatches.noticeId, noticeId))).map((m) => m.status);
  if (!canCloseNotice(statuses)) throw new JobError("Some devices are still waiting for action.");
  await tx.update(safetyNotices).set({ status: "closed", closedAt: new Date() }).where(eq(safetyNotices.id, noticeId));
}

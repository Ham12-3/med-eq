// Searching the audit log for evidence. PLAN.md M4 step 6.
// Reading the log is not itself audited; exporting is limited to the admin role.

import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { AUDIT_PAGE_SIZE, AUDITED_TABLES, type AuditFilters, type AuditedTable } from "@/lib/audit/filters";
import { changedFields } from "@/lib/data/assets";

export type AuditEntry = {
  id: number;
  at: string; // London time, to the second
  userName: string | null;
  action: "insert" | "update";
  tableName: string;
  tableLabel: string;
  recordId: string;
  recordLabel: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>;
  changes: { field: string; from: unknown; to: unknown }[];
};

export type AuditSearch =
  | { ok: true; entries: AuditEntry[]; total: number }
  | { ok: false; message: string };

/** Turns the filters into a WHERE clause. Device and notice filters follow the records they own. */
async function conditions(db: Db, f: AuditFilters): Promise<{ where: SQL[] } | { message: string }> {
  const where: SQL[] = [];
  if (f.from) where.push(sql`al.occurred_at >= (${f.from}::date)::timestamp at time zone 'Europe/London'`);
  if (f.to) where.push(sql`al.occurred_at < (${f.to}::date + 1)::timestamp at time zone 'Europe/London'`);
  if (f.user) where.push(sql`al.user_id = ${f.user}`);
  if (f.table) where.push(sql`al.table_name = ${f.table}`);
  if (f.action) where.push(sql`al.action = ${f.action}`);

  if (f.asset) {
    const [asset] = await db.execute<{ id: string }>(sql`select id from assets where giai = ${f.asset}`);
    if (!asset) return { message: `No device has the code ${f.asset}.` };
    where.push(sql`(
      (al.table_name = 'assets' and al.record_id = ${asset.id})
      or al.new_value->>'asset_id' = ${asset.id}
      or (al.table_name in ('test_results', 'parts_used')
          and al.new_value->>'work_order_id' in (select id::text from work_orders where asset_id = ${asset.id})))`);
  }
  if (f.notice) {
    const [notice] = await db.execute<{ id: string }>(sql`select id from safety_notices where reference = ${f.notice}`);
    if (!notice) return { message: `No safety notice has the reference ${f.notice}.` };
    where.push(sql`(
      (al.table_name = 'safety_notices' and al.record_id = ${notice.id})
      or (al.table_name in ('safety_notice_criteria', 'safety_notice_matches') and al.new_value->>'notice_id' = ${notice.id})
      or (al.table_name = 'work_orders' and al.new_value->>'safety_notice_match_id' in
          (select id::text from safety_notice_matches where notice_id = ${notice.id})))`);
  }
  return { where };
}

type RawEntry = Omit<AuditEntry, "tableLabel" | "changes">;

function finish(row: RawEntry): AuditEntry {
  return {
    ...row,
    tableLabel: AUDITED_TABLES[row.tableName as AuditedTable] ?? row.tableName,
    changes: changedFields(row.oldValue, row.newValue),
  };
}

/** Newest first, one page at a time; exports pass a larger page. */
export async function searchAudit(db: Db, f: AuditFilters, page: { limit: number; offset: number } = { limit: AUDIT_PAGE_SIZE, offset: (f.page - 1) * AUDIT_PAGE_SIZE }): Promise<AuditSearch> {
  const built = await conditions(db, f);
  if ("message" in built) return { ok: false, message: built.message };
  const where = built.where.length ? sql`where ${sql.join(built.where, sql` and `)}` : sql``;

  const rows = await db.execute<RawEntry & { total: number }>(sql`
    select al.id, to_char(al.occurred_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI:SS') as at,
           u.name as "userName", al.action, al.table_name as "tableName", al.record_id as "recordId",
           coalesce(al.new_value->>'giai', al.new_value->>'number', al.new_value->>'reference', al.new_value->>'email',
                    al.new_value->>'name', al.record_id) as "recordLabel",
           al.old_value as "oldValue", al.new_value as "newValue", count(*) over ()::int as total
    from audit_log al left join users u on u.id = al.user_id
    ${where}
    order by al.occurred_at desc, al.id desc
    limit ${page.limit} offset ${page.offset}`);
  return { ok: true, entries: rows.map(({ total, ...r }) => finish(r)), total: rows[0]?.total ?? 0 };
}

export async function auditUsers(db: Db) {
  const rows = await db.execute<{ id: string; name: string; role: string }>(sql`select id, name, role from users order by name`);
  return [...rows];
}

/** One line per change, for tables and evidence: "status: open → completed; outcome: – → returned_to_use". */
export function changeSummary(entry: Pick<AuditEntry, "action" | "changes">): string {
  if (entry.action === "insert") return "Created";
  const show = (v: unknown) => (v === null || v === undefined ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return entry.changes.map((c) => `${c.field}: ${show(c.from)} → ${show(c.to)}`).join("; ") || "No field changed";
}

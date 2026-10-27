// Audit search filters, kept in the URL like the asset register's.

import { isIsoDate, type IsoDate } from "@/lib/dates";

export const AUDITED_TABLES = {
  assets: "Device record",
  ppm_schedules: "PPM schedule",
  work_orders: "Job",
  test_results: "Test result",
  parts_used: "Part used",
  location_events: "Location",
  library_movements: "Library movement",
  safety_notices: "Safety notice",
  safety_notice_criteria: "Notice criterion",
  safety_notice_matches: "Notice match",
  incidents: "Incident",
  device_models: "Device model",
  em_score_history: "EM score",
  test_templates: "Test template",
  test_template_items: "Test template item",
  users: "User",
  departments: "Department",
  rooms: "Room",
  floors: "Floor",
  buildings: "Building",
  sites: "Site",
  saved_views: "Saved view",
} as const;
export type AuditedTable = keyof typeof AUDITED_TABLES;

export const AUDIT_PAGE_SIZE = 100;

export type AuditFilters = {
  from: IsoDate | "";
  to: IsoDate | "";
  user: string;
  table: AuditedTable | "";
  action: "insert" | "update" | "";
  asset: string; // GIAI
  notice: string; // notice reference
  page: number;
};

export const DEFAULT_AUDIT_FILTERS: AuditFilters = { from: "", to: "", user: "", table: "", action: "", asset: "", notice: "", page: 1 };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAuditFilters(params: Params): AuditFilters {
  const from = first(params.from);
  const to = first(params.to);
  const table = first(params.table);
  const action = first(params.action);
  const page = Number.parseInt(first(params.page), 10);
  return {
    from: isIsoDate(from) ? from : "",
    to: isIsoDate(to) ? to : "",
    user: UUID.test(first(params.user)) ? first(params.user) : "",
    table: table in AUDITED_TABLES ? (table as AuditedTable) : "",
    action: action === "insert" || action === "update" ? action : "",
    asset: /^[0-9A-Za-z]{8,30}$/.test(first(params.asset)) ? first(params.asset).toUpperCase() : "",
    notice: first(params.notice).slice(0, 60),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 100_000) : 1,
  };
}

export function auditFiltersToQuery(f: AuditFilters, changes: Partial<AuditFilters> = {}): string {
  const merged = { ...f, ...changes };
  const params = new URLSearchParams();
  for (const key of ["from", "to", "user", "table", "action", "asset", "notice"] as const) {
    if (merged[key]) params.set(key, merged[key]);
  }
  if (merged.page !== 1) params.set("page", String(merged.page));
  return params.toString();
}

/** A plain-English line describing the filters, printed on exported evidence. */
export function describeAuditFilters(f: AuditFilters, names: { user?: string } = {}): string {
  const parts: string[] = [];
  if (f.asset) parts.push(`device ${f.asset}`);
  if (f.notice) parts.push(`safety notice ${f.notice}`);
  if (f.table) parts.push(`${AUDITED_TABLES[f.table].toLowerCase()} records`);
  if (f.action) parts.push(f.action === "insert" ? "creations" : "changes");
  if (f.user) parts.push(`by ${names.user ?? "one user"}`);
  if (f.from && f.to) parts.push(`from ${f.from} to ${f.to}`);
  else if (f.from) parts.push(`from ${f.from}`);
  else if (f.to) parts.push(`up to ${f.to}`);
  return parts.length ? `Audit entries for ${parts.join(", ")}.` : "All audit entries.";
}

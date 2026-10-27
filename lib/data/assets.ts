// Reads and writes for assets, locations and the register.
// Callers check permissions first (lib/auth/session.ts); everything here takes the db or tx it is given.

import { sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { locationEvents } from "@/db/schema";
import { PAGE_SIZE, type AssetFilters, type SortKey } from "@/lib/assets/filters";
import type { IsoDate } from "@/lib/dates";
import type { DisplayStatus, Reason } from "@/lib/rules/assetStatus";
import { rankNearest, distanceBetween, describeDistance } from "@/lib/rules/nearest";

type Reader = Db | Tx;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LONDON_TIME = (column: SQL) => sql`to_char(${column} at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI')`;

// ---------- the register ----------

export type AssetRow = {
  id: string;
  giai: string;
  serialNumber: string;
  modelName: string;
  ownerName: string;
  roomName: string | null;
  floorName: string | null;
  buildingName: string | null;
  seenAt: string | null;
  nextDueOn: string | null;
  doNotUse: boolean;
  reasons: Reason[];
  display: DisplayStatus;
};

const STATUS_RANK = sql`array_position(array['recalled','do_not_use','due_soon','in_use','available','decommissioned']::text[], s.display_status)`;

const SORT_COLUMNS: Record<SortKey, SQL[]> = {
  giai: [sql`a.giai`],
  model: [sql`m.name`],
  owner: [sql`d.name`],
  location: [sql`b.code`, sql`f.level`, sql`r.corridor_position`, sql`r.name`],
  next_due: [sql`p.next_due_on`],
  status: [STATUS_RANK],
};

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listAssets(db: Reader, f: AssetFilters, today: IsoDate) {
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where.push(sql`(a.giai ilike ${like} or a.serial_number ilike ${like} or m.name ilike ${like})`);
  }
  if (f.status.length) where.push(sql`s.display_status in ${f.status}`);
  if (f.model) where.push(sql`m.slug = ${f.model}`);
  if (f.dept) where.push(sql`d.code = ${f.dept}`);
  if (f.floor) where.push(sql`f.id = ${f.floor}`);
  if (f.room) where.push(sql`r.id = ${f.room}`);
  if (f.overdue) where.push(sql`'PPM_OVERDUE' = any(s.reasons)`);

  const dir = sql.raw(f.dir === "desc" ? "desc" : "asc");
  const order = sql.join([...SORT_COLUMNS[f.sort], sql`a.giai`].map((c) => sql`${c} ${dir} nulls last`), sql`, `);

  const rows = await db.execute<AssetRow & { total: number }>(sql`
    select a.id, a.giai, a.serial_number as "serialNumber", m.name as "modelName", d.name as "ownerName",
           r.name as "roomName", f.name as "floorName", b.name as "buildingName",
           ${LONDON_TIME(sql`l.occurred_at`)} as "seenAt", p.next_due_on::text as "nextDueOn",
           s.do_not_use as "doNotUse", s.reasons, s.display_status as display,
           count(*) over ()::int as total
    from assets a
    join device_models m on m.id = a.device_model_id
    join departments d on d.id = a.owner_department_id
    join asset_status_on(${today}::date) s on s.asset_id = a.id
    left join asset_current_location l on l.asset_id = a.id
    left join rooms r on r.id = l.room_id
    left join floors f on f.id = r.floor_id
    left join buildings b on b.id = f.building_id
    left join ppm_schedules p on p.asset_id = a.id and p.active
    ${where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``}
    order by ${order}
    limit ${PAGE_SIZE} offset ${(f.page - 1) * PAGE_SIZE}`);

  return { rows: rows.map(({ total, ...row }) => row as AssetRow), total: rows[0]?.total ?? 0 };
}

export async function filterOptions(db: Reader) {
  const [models, departments, rooms] = await Promise.all([
    db.execute<{ slug: string; name: string }>(sql`select slug, name from device_models order by name`),
    db.execute<{ code: string; name: string }>(sql`select code, name from departments order by name`),
    roomOptions(db),
  ]);
  return { models: [...models], departments: [...departments], rooms };
}

export type RoomOption = { id: string; name: string; floorId: string; floorLabel: string; roomType: string };

export async function roomOptions(db: Reader): Promise<RoomOption[]> {
  const rows = await db.execute<RoomOption>(sql`
    select r.id, r.name, f.id as "floorId", b.name || ', ' || f.name as "floorLabel", r.room_type as "roomType"
    from rooms r join floors f on f.id = r.floor_id join buildings b on b.id = f.building_id
    where r.active
    order by b.code, f.level, r.corridor_position, r.corridor_side`);
  return [...rows];
}

// ---------- saved views ----------

export async function listSavedViews(db: Reader, userId: string, page: string) {
  const rows = await db.execute<{ id: string; name: string; query: string }>(sql`
    select id, name, query from saved_views
    where user_id = ${userId} and page = ${page} and not archived
    order by name`);
  return [...rows];
}

// ---------- one asset ----------

export type AssetSummary = {
  id: string;
  giai: string;
  serialNumber: string;
  modelName: string;
  modelSlug: string;
  manufacturer: string;
  category: string;
  isTestEquipment: boolean;
  ownerName: string;
  lifecycleStatus: string;
  inUse: boolean;
  firmwareVersion: string | null;
  acquisitionType: string;
  purchaseDate: string | null;
  purchasePricePence: number | null;
  endOfLifeDate: string | null;
  acceptedAt: string | null;
  roomId: string | null;
  roomName: string | null;
  floorName: string | null;
  buildingName: string | null;
  seenAt: string | null;
  intervalMonths: number | null;
  intervalReason: string | null;
  lastDoneOn: string | null;
  nextDueOn: string | null;
  scheduleActive: boolean | null;
  scheduleId: string | null;
  doNotUse: boolean;
  reasons: Reason[];
  display: DisplayStatus;
};

const SUMMARY_COLUMNS = sql`
  a.id, a.giai, a.serial_number as "serialNumber", m.name as "modelName", m.slug as "modelSlug",
  m.manufacturer, m.category, m.is_test_equipment as "isTestEquipment", d.name as "ownerName",
  a.lifecycle_status as "lifecycleStatus", a.in_use as "inUse", a.firmware_version as "firmwareVersion",
  a.acquisition_type as "acquisitionType", a.purchase_date::text as "purchaseDate",
  a.purchase_price_pence as "purchasePricePence", a.end_of_life_date::text as "endOfLifeDate",
  ${LONDON_TIME(sql`a.accepted_at`)} as "acceptedAt",
  r.id as "roomId", r.name as "roomName", f.name as "floorName", b.name as "buildingName",
  ${LONDON_TIME(sql`l.occurred_at`)} as "seenAt",
  p.interval_months as "intervalMonths", m.ppm_interval_reason as "intervalReason",
  p.last_done_on::text as "lastDoneOn", p.next_due_on::text as "nextDueOn",
  p.active as "scheduleActive", p.id as "scheduleId",
  s.do_not_use as "doNotUse", s.reasons, s.display_status as display`;

const SUMMARY_FROM = (today: IsoDate) => sql`
  from assets a
  join device_models m on m.id = a.device_model_id
  join departments d on d.id = a.owner_department_id
  join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
  left join asset_current_location l on l.asset_id = a.id
  left join rooms r on r.id = l.room_id
  left join floors f on f.id = r.floor_id
  left join buildings b on b.id = f.building_id
  left join ppm_schedules p on p.asset_id = a.id`;

export async function getAssetSummary(db: Reader, id: string, today: IsoDate): Promise<AssetSummary | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.execute<AssetSummary>(sql`select ${SUMMARY_COLUMNS} ${SUMMARY_FROM(today)} where a.id = ${id}`);
  return row ?? null;
}

export async function getAssetSummaryByGiai(db: Reader, giai: string, today: IsoDate): Promise<AssetSummary | null> {
  const [row] = await db.execute<AssetSummary>(sql`select ${SUMMARY_COLUMNS} ${SUMMARY_FROM(today)} where a.giai = ${giai}`);
  return row ?? null;
}

export type AssetHistory = Awaited<ReturnType<typeof getAssetHistory>>;

/** Everything on the full device page below the summary. */
export async function getAssetHistory(db: Reader, asset: Pick<AssetSummary, "id" | "scheduleId">) {
  const [locations, workOrders, results, parts, audit] = await Promise.all([
    db.execute<{ id: number; at: string; roomName: string; floorLabel: string; source: string; by: string | null }>(sql`
      select e.id, ${LONDON_TIME(sql`e.occurred_at`)} as at, r.name as "roomName",
             b.name || ', ' || f.name as "floorLabel", e.source, u.name as by
      from location_events e
      join rooms r on r.id = e.room_id join floors f on f.id = r.floor_id join buildings b on b.id = f.building_id
      left join users u on u.id = e.scanned_by_id
      where e.asset_id = ${asset.id}
      order by e.occurred_at desc, e.id desc
      limit 25`),
    db.execute<{
      id: string; number: string; type: string; status: string; priority: string; outcome: string | null;
      faultReason: string | null; dueOn: string | null; createdAt: string; completedAt: string | null; assignee: string | null;
    }>(sql`
      select w.id, w.number, w.type, w.status, w.priority, w.outcome, w.fault_reason as "faultReason",
             w.due_on::text as "dueOn", ${LONDON_TIME(sql`w.created_at`)} as "createdAt",
             ${LONDON_TIME(sql`w.completed_at`)} as "completedAt", u.name as assignee
      from work_orders w left join users u on u.id = w.assignee_id
      where w.asset_id = ${asset.id}
      order by w.created_at desc, w.number desc`),
    db.execute<{
      workOrderId: string; name: string; group: string; value: string | null; unit: string | null;
      lower: string | null; upper: string | null; outcome: string; analyser: string | null;
    }>(sql`
      select r.work_order_id as "workOrderId", i.name, i."group", r.measured_value::text as value, r.unit,
             r.lower_limit::text as lower, r.upper_limit::text as upper, r.outcome, an.giai as analyser
      from test_results r
      join test_template_items i on i.id = r.template_item_id
      join work_orders w on w.id = r.work_order_id
      left join assets an on an.id = r.analyser_asset_id
      where w.asset_id = ${asset.id}
      order by i.position`),
    db.execute<{ number: string; partNumber: string; description: string; supplier: string; lotNumber: string | null; quantity: number; at: string }>(sql`
      select w.number, p.part_number as "partNumber", p.description, p.supplier, p.lot_number as "lotNumber",
             p.quantity, ${LONDON_TIME(sql`p.recorded_at`)} as at
      from parts_used p join work_orders w on w.id = p.work_order_id
      where w.asset_id = ${asset.id}
      order by p.recorded_at desc`),
    db.execute<{ id: number; tableName: string; action: string; oldValue: Record<string, unknown> | null; newValue: Record<string, unknown>; at: string; by: string | null }>(sql`
      select al.id, al.table_name as "tableName", al.action, al.old_value as "oldValue", al.new_value as "newValue",
             ${LONDON_TIME(sql`al.occurred_at`)} as at, u.name as by
      from audit_log al left join users u on u.id = al.user_id
      where (al.table_name = 'assets' and al.record_id = ${asset.id})
         or (al.table_name = 'ppm_schedules' and al.record_id = ${asset.scheduleId ?? ""})
      order by al.occurred_at desc, al.id desc
      limit 50`),
  ]);
  return {
    locations: [...locations],
    workOrders: [...workOrders],
    results: [...results],
    parts: [...parts],
    audit: [...audit].map((row) => ({ ...row, changes: changedFields(row.oldValue, row.newValue) })),
  };
}

/** Which fields an audited update changed, ignoring updated_at. */
export function changedFields(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown>) {
  if (!oldValue) return [];
  return Object.keys(newValue)
    .filter((key) => key !== "updated_at" && JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key]))
    .map((key) => ({ field: key, from: oldValue[key], to: newValue[key] }));
}

// ---------- rooms ----------

export type RoomSummary = { id: string; gln: string; name: string; floorLabel: string };

export async function getRoomByGln(db: Reader, gln: string): Promise<RoomSummary | null> {
  const [row] = await db.execute<RoomSummary>(sql`
    select r.id, r.gln, r.name, b.name || ', ' || f.name as "floorLabel"
    from rooms r join floors f on f.id = r.floor_id join buildings b on b.id = f.building_id
    where r.gln = ${gln} and r.active`);
  return row ?? null;
}

// ---------- writes ----------

export async function recordLocation(tx: Tx, input: { assetId: string; roomId: string; source: "scan" | "manual"; userId: string }) {
  const [event] = await tx.insert(locationEvents).values({
    assetId: input.assetId, roomId: input.roomId, source: input.source,
    scannedById: input.userId, occurredAt: new Date(),
  }).returning({ id: locationEvents.id });
  return event;
}

export async function setInUse(tx: Tx, assetId: string, inUse: boolean) {
  await tx.execute(sql`update assets set in_use = ${inUse} where id = ${assetId}`);
}

// ---------- nearest available ----------

export type NearestResult = {
  id: string;
  giai: string;
  modelName: string;
  roomName: string;
  floorLabel: string;
  roomType: string;
  seenAt: string | null;
  display: DisplayStatus;
  distance: string;
};

/** Working, in-date, free devices of a model, nearest to a room first. */
export async function findNearestAvailable(db: Reader, roomId: string, modelSlug: string, today: IsoDate): Promise<NearestResult[] | null> {
  if (!UUID.test(roomId)) return null;
  const [origin] = await db.execute<{ buildingId: string; level: number; corridorPosition: number }>(sql`
    select f.building_id as "buildingId", f.level, r.corridor_position as "corridorPosition"
    from rooms r join floors f on f.id = r.floor_id where r.id = ${roomId}`);
  if (!origin) return null;

  const candidates = await db.execute<Omit<NearestResult, "distance"> & { buildingId: string; level: number; corridorPosition: number }>(sql`
    select a.id, a.giai, m.name as "modelName", r.name as "roomName", b.name || ', ' || f.name as "floorLabel",
           r.room_type as "roomType", ${LONDON_TIME(sql`l.occurred_at`)} as "seenAt", s.display_status as display,
           f.building_id as "buildingId", f.level, r.corridor_position as "corridorPosition"
    from assets a
    join device_models m on m.id = a.device_model_id
    join asset_status_on(${today}::date) s on s.asset_id = a.id
    join asset_current_location l on l.asset_id = a.id
    join rooms r on r.id = l.room_id join floors f on f.id = r.floor_id join buildings b on b.id = f.building_id
    where m.slug = ${modelSlug} and a.lifecycle_status = 'in_service' and not a.in_use and not s.do_not_use`);

  return rankNearest(origin, [...candidates]).map(({ buildingId, level, corridorPosition, ...rest }) => ({
    ...rest,
    distance: describeDistance(distanceBetween(origin, { buildingId, level, corridorPosition })),
  }));
}

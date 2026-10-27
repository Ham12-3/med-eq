// The equipment library: stock owned by the Equipment Library department, lent to wards.
// Every check-out and check-in writes a location event and a library movement together.

import { eq, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { assets, libraryMovements, locationEvents } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/users";
import { UUID } from "@/lib/data/assets";
import { JobError } from "@/lib/data/workOrders";
import type { IsoDate } from "@/lib/dates";
import type { DisplayStatus } from "@/lib/rules/assetStatus";
import { checkOutBlockers, isLoanOverdue, libraryState, type LibraryState } from "@/lib/rules/library";

type Reader = Db | Tx;

export type LibraryDevice = {
  id: string;
  giai: string;
  modelName: string;
  modelSlug: string;
  roomName: string | null;
  roomType: string | null;
  floorLabel: string | null;
  seenOn: string | null;
  lastDirection: "check_out" | "check_in" | null;
  cleaned: boolean | null;
  charged: boolean | null;
  lastMovementOn: string | null;
  outToDept: string | null;
  display: DisplayStatus;
  doNotUse: boolean;
  lifecycleStatus: string;
  // derived
  state: LibraryState;
  inWorkshop: boolean;
  onLoanSince: string | null;
  loanOverdue: boolean;
};

const LONDON_DATE = (column: SQL) => sql`(${column} at time zone 'Europe/London')::date::text`;

function deviceQuery(today: IsoDate, where: SQL) {
  return sql`
    select a.id, a.giai, m.name as "modelName", m.slug as "modelSlug", r.name as "roomName", r.room_type as "roomType",
           b.name || ', ' || f.name as "floorLabel", ${LONDON_DATE(sql`l.occurred_at`)} as "seenOn",
           lm.direction as "lastDirection", lm.cleaned, lm.charged, ${LONDON_DATE(sql`lm.occurred_at`)} as "lastMovementOn",
           dd.name as "outToDept", s.display_status as display, s.do_not_use as "doNotUse", a.lifecycle_status as "lifecycleStatus"
    from assets a
    join departments od on od.id = a.owner_department_id and od.code = 'LIB'
    join device_models m on m.id = a.device_model_id
    join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
    left join asset_current_location l on l.asset_id = a.id
    left join rooms r on r.id = l.room_id
    left join floors f on f.id = r.floor_id
    left join buildings b on b.id = f.building_id
    left join lateral (
      select direction, cleaned, charged, department_id, occurred_at from library_movements x
      where x.asset_id = a.id order by x.occurred_at desc limit 1
    ) lm on true
    left join departments dd on dd.id = lm.department_id and lm.direction = 'check_out'
    where a.lifecycle_status <> 'decommissioned' and ${where}
    order by m.name, a.giai`;
}

function derive(row: Omit<LibraryDevice, "state" | "inWorkshop" | "onLoanSince" | "loanOverdue">, today: IsoDate): LibraryDevice {
  const inLibrary = row.roomType === "equipment_library";
  const state = libraryState(inLibrary, row.lastDirection ? { direction: row.lastDirection, cleaned: row.cleaned, charged: row.charged } : null);
  const inWorkshop = row.roomType === "workshop";
  const onLoanSince = state === "out" && !inWorkshop
    ? (row.lastDirection === "check_out" ? row.lastMovementOn : row.seenOn)
    : null;
  return { ...row, state, inWorkshop, onLoanSince, loanOverdue: onLoanSince !== null && isLoanOverdue(onLoanSince, today) };
}

export async function libraryDevices(db: Reader, today: IsoDate): Promise<LibraryDevice[]> {
  const rows = await db.execute<Parameters<typeof derive>[0]>(deviceQuery(today, sql`true`));
  return rows.map((r) => derive(r, today));
}

export async function libraryDevice(db: Reader, assetId: string, today: IsoDate): Promise<LibraryDevice | null> {
  if (!UUID.test(assetId)) return null;
  const [row] = await db.execute<Parameters<typeof derive>[0]>(deviceQuery(today, sql`a.id = ${assetId}`));
  return row ? derive(row, today) : null;
}

export async function libraryDeviceByGiai(db: Reader, giai: string, today: IsoDate): Promise<LibraryDevice | null> {
  const [row] = await db.execute<Parameters<typeof derive>[0]>(deviceQuery(today, sql`a.giai = ${giai}`));
  return row ? derive(row, today) : null;
}

export type StockRow = { modelName: string; ready: number; needsPrep: number; onLoan: number; inWorkshop: number };

/** Counts per model, for the "ready stock" table. */
export function stockByModel(devices: LibraryDevice[]): StockRow[] {
  const byModel = new Map<string, StockRow>();
  for (const d of devices) {
    const row = byModel.get(d.modelName) ?? { modelName: d.modelName, ready: 0, needsPrep: 0, onLoan: 0, inWorkshop: 0 };
    if (d.inWorkshop) row.inWorkshop++;
    else if (d.state === "ready") row.ready++;
    else if (d.state === "needs_prep") row.needsPrep++;
    else row.onLoan++;
    byModel.set(d.modelName, row);
  }
  return [...byModel.values()];
}

async function libraryRoomId(tx: Tx): Promise<string> {
  const [room] = await tx.execute<{ id: string }>(sql`select id from rooms where room_type = 'equipment_library' and active limit 1`);
  if (!room) throw new JobError("There is no equipment library room set up.");
  return room.id;
}

type Source = "scan" | "manual";

/** Lends a ready device to a ward. It is then marked in use (PLAN.md Q4). */
export async function checkOut(tx: Tx, user: CurrentUser, input: { assetId: string; roomId: string; source: Source; today: IsoDate }) {
  await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, input.assetId)).for("update");
  const device = await libraryDevice(tx, input.assetId, input.today);
  if (!device) throw new JobError("That device is not library stock.");
  const blockers = checkOutBlockers({ state: device.state, doNotUse: device.doNotUse });
  if (blockers.length) throw new JobError(blockers.join(" "));

  const [room] = await tx.execute<{ id: string; name: string; departmentId: string | null; roomType: string }>(sql`
    select id, name, department_id as "departmentId", room_type as "roomType" from rooms where id = ${input.roomId} and active`);
  if (!room || ["equipment_library", "workshop"].includes(room.roomType)) throw new JobError("Choose the ward or room it is going to.");

  const [event] = await tx.insert(locationEvents).values({
    assetId: input.assetId, roomId: room.id, source: input.source, scannedById: user.id, occurredAt: new Date(),
  }).returning({ id: locationEvents.id });
  await tx.insert(libraryMovements).values({
    assetId: input.assetId, direction: "check_out", roomId: room.id, departmentId: room.departmentId,
    locationEventId: event.id, byUserId: user.id,
  });
  await tx.update(assets).set({ inUse: true }).where(eq(assets.id, input.assetId));
  return room.name;
}

/**
 * Takes a device back into the library, recording whether it has been cleaned and charged.
 * Doing it again for a device already in the library records that it is now ready.
 */
export async function checkIn(
  tx: Tx, user: CurrentUser,
  input: { assetId: string; cleaned: boolean; charged: boolean; source: Source; today: IsoDate },
) {
  await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, input.assetId)).for("update");
  const device = await libraryDevice(tx, input.assetId, input.today);
  if (!device) throw new JobError("That device is not library stock.");
  if (device.inWorkshop) throw new JobError("That device is in the workshop. Clinical engineering returns it when it is fixed.");

  const roomId = await libraryRoomId(tx);
  const [event] = await tx.insert(locationEvents).values({
    assetId: input.assetId, roomId, source: input.source, scannedById: user.id, occurredAt: new Date(),
  }).returning({ id: locationEvents.id });
  await tx.insert(libraryMovements).values({
    assetId: input.assetId, direction: "check_in", roomId, locationEventId: event.id, byUserId: user.id,
    cleaned: input.cleaned, charged: input.charged,
  });
  await tx.update(assets).set({ inUse: false }).where(eq(assets.id, input.assetId));
  return libraryState(true, { direction: "check_in", cleaned: input.cleaned, charged: input.charged });
}

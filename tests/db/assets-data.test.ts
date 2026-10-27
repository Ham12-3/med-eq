import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { DEFAULT_FILTERS, PAGE_SIZE, type AssetFilters } from "@/lib/assets/filters";
import {
  changedFields, findNearestAvailable, getAssetHistory, getAssetSummary, getAssetSummaryByGiai,
  getRoomByGln, listAssets, recordLocation, setInUse,
} from "@/lib/data/assets";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

const list = (changes: Partial<AssetFilters>) => listAssets(db, { ...DEFAULT_FILTERS, ...changes }, TEST_TODAY);

async function anyTechnician() {
  const [u] = await db.execute<{ id: string }>(sql`select id from users where role = 'technician' limit 1`);
  return u.id;
}

describe("listAssets", () => {
  it("pages through all 403 assets, 50 at a time, sorted by GIAI", async () => {
    const first = await list({});
    expect(first.total).toBe(403);
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.rows.map((r) => r.giai)).toEqual([...first.rows.map((r) => r.giai)].sort());
    const last = await list({ page: 9 });
    expect(last.rows).toHaveLength(3);
  });

  it("filters to overdue PPM", async () => {
    const result = await list({ overdue: true });
    expect(result.total).toBe(32);
    expect(result.rows.every((r) => r.reasons.includes("PPM_OVERDUE") && r.doNotUse)).toBe(true);
  });

  it("filters by several statuses at once", async () => {
    const result = await list({ status: ["do_not_use", "decommissioned"] });
    expect(result.rows.every((r) => ["do_not_use", "decommissioned"].includes(r.display))).toBe(true);
    const dnu = await list({ status: ["do_not_use"] });
    const decommissioned = await list({ status: ["decommissioned"] });
    expect(result.total).toBe(dnu.total + decommissioned.total);
    expect(decommissioned.total).toBe(4);
  });

  it("filters by model, owner and search text", async () => {
    expect((await list({ model: "ventilator" })).total).toBe(18);
    expect((await list({ dept: "LIB" })).rows.every((r) => r.ownerName === "Equipment Library")).toBe(true);
    expect((await list({ q: "0299999DEF0000" })).total).toBe(20); // DEF000001-20
    expect((await list({ q: "0299999def000007" })).total).toBe(1); // case-insensitive, one device
    expect((await list({ q: "100%_" })).total).toBe(0); // LIKE wildcards are escaped
  });

  it("filters by room and floor", async () => {
    const [room] = await db.execute<{ id: string; floor_id: string }>(sql`select id, floor_id from rooms where name = 'EBME Workshop'`);
    const inWorkshop = await list({ room: room.id });
    expect(inWorkshop.total).toBeGreaterThanOrEqual(14 + 3); // under repair, quarantined, analysers
    expect(inWorkshop.rows.every((r) => r.roomName === "EBME Workshop")).toBe(true);
    const onFloor = await list({ floor: room.floor_id });
    expect(onFloor.total).toBeGreaterThan(inWorkshop.total);
  });

  it("sorts by status severity, recalled and do-not-use first", async () => {
    const { rows } = await list({ sort: "status" });
    expect(rows[0].display).toBe("do_not_use");
    const desc = await list({ sort: "status", dir: "desc" });
    expect(desc.rows[0].display).toBe("decommissioned");
  });

  it("sorts by next due date with gaps last", async () => {
    const { rows } = await list({ sort: "next_due" });
    const dates = rows.map((r) => r.nextDueOn!).filter(Boolean);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("one asset", () => {
  it("summarises an asset by id and by GIAI", async () => {
    const [{ id }] = await db.execute<{ id: string }>(sql`select id from assets where lifecycle_status = 'quarantined' limit 1`);
    const summary = await getAssetSummary(db, id, TEST_TODAY);
    expect(summary).toMatchObject({ id, lifecycleStatus: "quarantined", doNotUse: true, roomName: "EBME Workshop" });
    expect(summary!.reasons).toContain("FAILED_TEST");
    expect(await getAssetSummaryByGiai(db, summary!.giai, TEST_TODAY)).toEqual(summary);
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getAssetSummary(db, "not-a-uuid", TEST_TODAY)).toBeNull();
    expect(await getAssetSummary(db, "00000000-0000-4000-8000-00000000ffff", TEST_TODAY)).toBeNull();
    expect(await getAssetSummaryByGiai(db, "0299999XXX999999", TEST_TODAY)).toBeNull();
  });

  it("loads the full history for the device page", async () => {
    const [{ id }] = await db.execute<{ id: string }>(sql`
      select a.id from assets a where exists (select 1 from parts_used p join work_orders w on w.id = p.work_order_id where w.asset_id = a.id) limit 1`);
    const summary = (await getAssetSummary(db, id, TEST_TODAY))!;
    const history = await getAssetHistory(db, summary);
    expect(history.locations.length).toBeGreaterThan(0);
    expect(history.locations[0].roomName).toBe(summary.roomName);
    expect(history.workOrders.length).toBeGreaterThan(0);
    expect(history.results.length).toBeGreaterThan(0);
    expect(history.parts.length).toBeGreaterThan(0);
    expect(history.audit.some((a) => a.tableName === "assets" && a.action === "insert")).toBe(true);
  });
});

describe("writes", () => {
  it("records a location that becomes the current location, attributed to the user", async () => {
    const userId = await anyTechnician();
    const [asset] = await db.execute<{ id: string }>(sql`select id from assets limit 1`);
    const [room] = await db.execute<{ id: string; gln: string }>(sql`select id, gln from rooms where name = 'Theatre 2'`);
    await rolledBack(() => withUser(db, userId, async (tx) => {
      await recordLocation(tx, { assetId: asset.id, roomId: room.id, source: "scan", userId });
      const summary = await getAssetSummary(tx as unknown as typeof db, asset.id, TEST_TODAY);
      expect(summary!.roomName).toBe("Theatre 2");
      const [audit] = await tx.execute<{ user_id: string }>(sql`
        select user_id from audit_log where table_name = 'location_events' order by id desc limit 1`);
      expect(audit.user_id).toBe(userId);
      throw new Rollback();
    }));
    expect((await getRoomByGln(db, room.gln))!.name).toBe("Theatre 2");
  });

  it("marks a device in use and audits the change", async () => {
    const userId = await anyTechnician();
    const [asset] = await db.execute<{ id: string }>(sql`select id from assets where not in_use and lifecycle_status = 'in_service' limit 1`);
    await rolledBack(() => withUser(db, userId, async (tx) => {
      await setInUse(tx, asset.id, true);
      const [row] = await tx.execute<{ old_value: Record<string, unknown>; new_value: Record<string, unknown> }>(sql`
        select old_value, new_value from audit_log where table_name = 'assets' and record_id = ${asset.id} order by id desc limit 1`);
      expect(changedFields(row.old_value, row.new_value)).toEqual([{ field: "in_use", from: false, to: true }]);
      throw new Rollback();
    }));
  });
});

describe("findNearestAvailable", () => {
  it("lists only working, free, in-date pumps, nearest first", async () => {
    const [ward] = await db.execute<{ id: string }>(sql`select id from rooms where name = 'AMU Bay A'`);
    const results = (await findNearestAvailable(db, ward.id, "volumetric-infusion-pump", TEST_TODAY))!;
    expect(results.length).toBeGreaterThan(10);
    expect(results.every((r) => r.modelName.startsWith("Volumetric infusion pump"))).toBe(true);
    expect(results.every((r) => ["available", "due_soon"].includes(r.display))).toBe(true);
    // AMU Bay A is on the Main Building ground floor: that floor comes first, other buildings last.
    expect(results[0].floorLabel).toBe("Main Building, Ground floor");
    const firstOther = results.findIndex((r) => r.floorLabel !== "Main Building, Ground floor");
    expect(results.slice(firstOther).every((r) => r.floorLabel !== "Main Building, Ground floor")).toBe(true);
  });

  it("returns null for an unknown room", async () => {
    expect(await findNearestAvailable(db, "00000000-0000-4000-8000-00000000ffff", "ventilator", TEST_TODAY)).toBeNull();
  });
});

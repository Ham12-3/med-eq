import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser, type Db } from "@/db/client";
import { loadActiveUser } from "@/lib/auth/users";
import { floorMap, mapFloors } from "@/lib/data/map";
import { createNotice, markNotAffected } from "@/lib/data/notices";
import { NO_MAP_FILTERS } from "@/lib/map/filters";
import { MAP_STATUSES } from "@/lib/map/status";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

describe("floor map data", () => {
  it("lists the three floors with every non-decommissioned device on one of them", async () => {
    const floors = await mapFloors(db, NO_MAP_FILTERS);
    expect(floors.map((f) => f.label)).toEqual([
      "Main Building, Ground floor", "Main Building, First floor", "Outpatients Building, Ground floor",
    ]);
    const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from assets where lifecycle_status <> 'decommissioned'`);
    expect(floors.reduce((s, f) => s + f.devices, 0)).toBe(n);
  });

  it("places one marker per device, inside its room, with matching counts", async () => {
    for (const floor of await mapFloors(db, NO_MAP_FILTERS)) {
      const map = await floorMap(db, floor.id, TEST_TODAY, NO_MAP_FILTERS);
      expect(map.markers).toHaveLength(floor.devices);
      expect(MAP_STATUSES.reduce((s, st) => s + map.counts[st], 0)).toBe(floor.devices);
      const rooms = new Map(map.plan.rooms.map((r) => [r.id, r]));
      for (const m of map.markers) {
        const room = rooms.get(m.roomId)!;
        expect(Math.abs(m.x - room.x)).toBeLessThanOrEqual(room.width / 2);
        expect(Math.abs(m.z - room.z)).toBeLessThanOrEqual(room.depth / 2);
        expect(m.size).toBeGreaterThan(0);
        expect(m.size).toBeLessThanOrEqual(0.28);
      }
    }
  });

  it("narrows to a model or an owner, greying the rest without moving anything", async () => {
    const [ground] = await mapFloors(db, NO_MAP_FILTERS);
    const all = await floorMap(db, ground.id, TEST_TODAY, NO_MAP_FILTERS);
    const place = new Map(all.markers.map((m) => [m.id, `${m.x},${m.z}`]));

    const pumps = await floorMap(db, ground.id, TEST_TODAY, { ...NO_MAP_FILTERS, model: "volumetric-infusion-pump" });
    expect(pumps.markers.length).toBeGreaterThan(0);
    expect(pumps.markers.every((m) => m.modelName.startsWith("Volumetric infusion pump"))).toBe(true);
    expect(pumps.markers.length + pumps.context.length).toBe(all.markers.length);
    for (const m of pumps.markers) expect(`${m.x},${m.z}`).toBe(place.get(m.id));

    const library = await floorMap(db, ground.id, TEST_TODAY, { ...NO_MAP_FILTERS, dept: "LIB" });
    const [{ n }] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from asset_current_location l join rooms r on r.id = l.room_id and r.floor_id = ${ground.id}
      join assets a on a.id = l.asset_id join departments d on d.id = a.owner_department_id and d.code = 'LIB'
      where a.lifecycle_status <> 'decommissioned'`);
    expect(library.markers).toHaveLength(n);

    const floors = await mapFloors(db, { ...NO_MAP_FILTERS, model: "ventilator" });
    expect(floors.reduce((s, f) => s + f.devices, 0)).toBe(18);
  });

  it("shows only a notice's matched devices in recall mode, with where each stands", async () => {
    const [u] = await db.execute<{ id: string }>(sql`select id from users where role = 'admin' and active limit 1`);
    const admin = (await loadActiveUser(db, u.id))!;
    await rolledBack(() => withUser(db, admin.id, async (tx) => {
      const [model] = await tx.execute<{ id: string }>(sql`select id from device_models where slug = 'syringe-driver'`);
      const created = await createNotice(tx, admin, {
        reference: "MAP/TEST/1", source: "fsn", title: "t", description: "d", requiredAction: "a", issuedOn: TEST_TODAY,
        deadline: TEST_TODAY, quarantineRequired: true,
        criteria: [{ deviceModelId: model.id, serialFrom: null, serialTo: null, firmwareVersions: null }],
      });
      const [match] = await tx.execute<{ id: string }>(sql`select id from safety_notice_matches where notice_id = ${created.id} limit 1`);
      await markNotAffected(tx, admin, match.id, "checked");

      const t = tx as unknown as Db;
      const floors = await mapFloors(t, { ...NO_MAP_FILTERS, notice: created.id });
      expect(floors.reduce((s, f) => s + f.devices, 0)).toBe(created.matched);
      const busiest = floors.reduce((a, b) => (b.devices > a.devices ? b : a));
      const map = await floorMap(t, busiest.id, TEST_TODAY, { ...NO_MAP_FILTERS, notice: created.id });
      expect(map.markers).toHaveLength(busiest.devices);
      expect(map.markers.every((m) => m.modelName.startsWith("Syringe driver") && m.match !== null)).toBe(true);
      // Quarantine: waiting devices show as recalled; the one found not affected does not.
      expect(map.markers.filter((m) => m.match === "open").every((m) => m.status === "recalled")).toBe(true);
      throw new Rollback();
    }));
  });

  it("shows the same status as the rest of the app", async () => {
    const [ground] = await mapFloors(db, NO_MAP_FILTERS);
    const map = await floorMap(db, ground.id, TEST_TODAY, NO_MAP_FILTERS);
    const statuses = new Map((await db.execute<{ asset_id: string; display_status: string }>(sql`
      select asset_id, display_status from asset_status_on(${TEST_TODAY}::date)`)).map((s) => [s.asset_id, s.display_status]));
    for (const m of map.markers) expect(m.status).toBe(statuses.get(m.id));
    expect(map.markers.some((m) => m.status === "do_not_use" && m.reasons.length > 0)).toBe(true);
  });
});

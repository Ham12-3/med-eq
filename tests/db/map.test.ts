import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { floorMap, mapFloors } from "@/lib/data/map";
import { MAP_STATUSES } from "@/lib/map/status";
import { connectAsApp, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

describe("floor map data", () => {
  it("lists the three floors with every non-decommissioned device on one of them", async () => {
    const floors = await mapFloors(db);
    expect(floors.map((f) => f.label)).toEqual([
      "Main Building, Ground floor", "Main Building, First floor", "Outpatients Building, Ground floor",
    ]);
    const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from assets where lifecycle_status <> 'decommissioned'`);
    expect(floors.reduce((s, f) => s + f.devices, 0)).toBe(n);
  });

  it("places one marker per device, inside its room, with matching counts", async () => {
    for (const floor of await mapFloors(db)) {
      const map = await floorMap(db, floor.id, TEST_TODAY);
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

  it("shows the same status as the rest of the app", async () => {
    const [ground] = await mapFloors(db);
    const map = await floorMap(db, ground.id, TEST_TODAY);
    const statuses = new Map((await db.execute<{ asset_id: string; display_status: string }>(sql`
      select asset_id, display_status from asset_status_on(${TEST_TODAY}::date)`)).map((s) => [s.asset_id, s.display_status]));
    for (const m of map.markers) expect(m.status).toBe(statuses.get(m.id));
    expect(map.markers.some((m) => m.status === "do_not_use" && m.reasons.length > 0)).toBe(true);
  });
});

// Data for the floor map: the floors, and per floor its rooms and the devices last seen in them.

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { IsoDate } from "@/lib/dates";
import { layoutFloor, markerSpacing, markerSpots, type FloorPlan, type PlanRoomInput } from "@/lib/map/layout";
import { isMapStatus, MAP_STATUSES, type MapMarker, type MapStatus } from "@/lib/map/status";
import { REASON_TEXT, type DisplayStatus, type Reason } from "@/lib/rules/assetStatus";

export type MapFloor = { id: string; label: string; buildingName: string; level: number; devices: number };

export async function mapFloors(db: Db): Promise<MapFloor[]> {
  const rows = await db.execute<MapFloor>(sql`
    select f.id, b.name || ', ' || f.name as label, b.name as "buildingName", f.level,
           (select count(*)::int from asset_current_location l join rooms r on r.id = l.room_id
            join assets a on a.id = l.asset_id
            where r.floor_id = f.id and a.lifecycle_status <> 'decommissioned') as devices
    from floors f join buildings b on b.id = f.building_id
    order by b.code, f.level`);
  return [...rows];
}

export type FloorMap = {
  plan: FloorPlan;
  markers: MapMarker[];
  counts: Record<MapStatus, number>;
};

/** Rooms laid out, and one marker per device placed inside the room it was last seen in. */
export async function floorMap(db: Db, floorId: string, today: IsoDate): Promise<FloorMap> {
  const [rooms, devices] = await Promise.all([
    db.execute<PlanRoomInput>(sql`
      select id, gln, name, room_type as "roomType", corridor_position as "corridorPosition", corridor_side as "corridorSide"
      from rooms where floor_id = ${floorId} and active`),
    db.execute<{ id: string; giai: string; modelName: string; roomId: string; display: DisplayStatus; reasons: Reason[] }>(sql`
      select a.id, a.giai, m.name as "modelName", l.room_id as "roomId", s.display_status as display, s.reasons
      from asset_current_location l
      join rooms r on r.id = l.room_id and r.floor_id = ${floorId}
      join assets a on a.id = l.asset_id
      join device_models m on m.id = a.device_model_id
      join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
      where a.lifecycle_status <> 'decommissioned'
      order by l.room_id, m.name, a.giai`),
  ]);

  const plan = layoutFloor([...rooms]);
  const counts = Object.fromEntries(MAP_STATUSES.map((s) => [s, 0])) as Record<MapStatus, number>;
  const markers: MapMarker[] = [];
  for (const room of plan.rooms) {
    const here = devices.filter((d) => d.roomId === room.id && isMapStatus(d.display));
    const spots = markerSpots(room, here.length);
    const size = Math.min(0.28, markerSpacing(room, here.length) * 0.35);
    here.forEach((d, i) => {
      const status = d.display as MapStatus;
      counts[status]++;
      markers.push({
        id: d.id, giai: d.giai, modelName: d.modelName, roomId: room.id, roomName: room.name, status,
        reasons: d.reasons.map((r) => REASON_TEXT[r]), x: spots[i].x, z: spots[i].z, size,
      });
    });
  }
  return { plan, markers, counts };
}

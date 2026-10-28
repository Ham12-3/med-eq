// Data for the floor map: the floors, and per floor its rooms and the devices last seen in them,
// narrowed by the map's filters (model, owning department, or one safety notice's matches).

import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { IsoDate } from "@/lib/dates";
import type { MapFilters } from "@/lib/map/filters";
import { floorNodeName, layoutFloor, markerSpacing, markerSpots, type FloorPlan, type PlanRoomInput } from "@/lib/map/layout";
import { isMapStatus, MAP_STATUSES, type ContextDot, type MapMarker, type MapStatus } from "@/lib/map/status";
import { REASON_TEXT, type DisplayStatus, type Reason } from "@/lib/rules/assetStatus";

/** Devices that pass the filters (the notice filter keeps only that notice's matched devices). */
function passes(f: Pick<MapFilters, "model" | "dept" | "notice">): SQL {
  const parts: SQL[] = [sql`true`];
  if (f.model) parts.push(sql`m.slug = ${f.model}`);
  if (f.dept) parts.push(sql`d.code = ${f.dept}`);
  if (f.notice) parts.push(sql`exists (select 1 from safety_notice_matches sm where sm.asset_id = a.id and sm.notice_id = ${f.notice})`);
  return sql.join(parts, sql` and `);
}

export type MapFloor = { id: string; label: string; buildingName: string; level: number; devices: number };

/** Every floor, with how many devices on it pass the filters. */
export async function mapFloors(db: Db, f: Pick<MapFilters, "model" | "dept" | "notice">): Promise<MapFloor[]> {
  const rows = await db.execute<MapFloor>(sql`
    select fl.id, b.name || ', ' || fl.name as label, b.name as "buildingName", fl.level,
           (select count(*)::int from asset_current_location l
            join rooms r on r.id = l.room_id
            join assets a on a.id = l.asset_id
            join device_models m on m.id = a.device_model_id
            join departments d on d.id = a.owner_department_id
            where r.floor_id = fl.id and a.lifecycle_status <> 'decommissioned' and ${passes(f)}) as devices
    from floors fl join buildings b on b.id = fl.building_id
    order by b.code, fl.level`);
  return [...rows];
}

export async function mapFilterOptions(db: Db) {
  const [models, departments, notices] = await Promise.all([
    db.execute<{ slug: string; name: string }>(sql`select slug, name from device_models order by name`),
    db.execute<{ code: string; name: string }>(sql`select code, name from departments order by name`),
    db.execute<{ id: string; reference: string; title: string; status: "open" | "closed" }>(sql`
      select id, reference, title, status from safety_notices order by status desc, issued_on desc`),
  ]);
  return { models: [...models], departments: [...departments], notices: [...notices] };
}

export type FloorMap = {
  plan: FloorPlan;
  /** The floor's node in public/models/hospital.glb. */
  modelNode: string;
  markers: MapMarker[];
  context: ContextDot[];
  counts: Record<MapStatus, number>;
};

/**
 * Rooms laid out, with a marker for each device that passes the filters. Spots are worked out
 * over every device in the room, so a device keeps its place whatever the filter.
 */
export async function floorMap(db: Db, floorId: string, today: IsoDate, f: Pick<MapFilters, "model" | "dept" | "notice">): Promise<FloorMap> {
  const [[floor], rooms, devices] = await Promise.all([
    db.execute<{ code: string; level: number }>(sql`
      select b.code, fl.level from floors fl join buildings b on b.id = fl.building_id where fl.id = ${floorId}`),
    db.execute<PlanRoomInput>(sql`
      select id, gln, name, room_type as "roomType", corridor_position as "corridorPosition", corridor_side as "corridorSide"
      from rooms where floor_id = ${floorId} and active`),
    db.execute<{
      id: string; giai: string; modelName: string; roomId: string; display: DisplayStatus; reasons: Reason[];
      shown: boolean; match: MapMarker["match"];
    }>(sql`
      select a.id, a.giai, m.name as "modelName", l.room_id as "roomId", s.display_status as display, s.reasons,
             (${passes(f)}) as shown,
             ${f.notice ? sql`(select sm.status from safety_notice_matches sm where sm.asset_id = a.id and sm.notice_id = ${f.notice})` : sql`null`} as match
      from asset_current_location l
      join rooms r on r.id = l.room_id and r.floor_id = ${floorId}
      join assets a on a.id = l.asset_id
      join device_models m on m.id = a.device_model_id
      join departments d on d.id = a.owner_department_id
      join lateral (select * from asset_status_on(${today}::date) x where x.asset_id = a.id) s on true
      where a.lifecycle_status <> 'decommissioned'
      order by l.room_id, m.name, a.giai`),
  ]);

  const plan = layoutFloor([...rooms]);
  const counts = Object.fromEntries(MAP_STATUSES.map((s) => [s, 0])) as Record<MapStatus, number>;
  const markers: MapMarker[] = [];
  const context: ContextDot[] = [];
  for (const room of plan.rooms) {
    const here = devices.filter((d) => d.roomId === room.id && isMapStatus(d.display));
    const spots = markerSpots(room, here.length);
    const size = Math.min(0.28, markerSpacing(room, here.length) * 0.35);
    here.forEach((d, i) => {
      if (!d.shown) {
        context.push({ x: spots[i].x, z: spots[i].z, size: size * 0.6 });
        return;
      }
      const status = d.display as MapStatus;
      counts[status]++;
      markers.push({
        id: d.id, giai: d.giai, modelName: d.modelName, roomId: room.id, roomName: room.name, status,
        reasons: d.reasons.map((r) => REASON_TEXT[r]), x: spots[i].x, z: spots[i].z, size, match: d.match,
      });
    });
  }
  return { plan, modelNode: floorNodeName(floor.code, floor.level), markers, context, counts };
}

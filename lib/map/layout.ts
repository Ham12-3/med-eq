// The placeholder floor plan, built from the rooms table (PLAN.md M5 step 1).
// Metres, three.js axes: x along the corridor, z across it (north is negative z), y up.
// Room sizes follow PLAN.md Phase 5 so the later Blender model lines up with this one.

export const CORRIDOR_WIDTH = 2.4;
export const WALL_HEIGHT = 2.8;
const GAP = 0.15; // wall thickness between neighbouring rooms

export const ROOM_SIZE: Record<string, { width: number; depth: number }> = {
  ward: { width: 8, depth: 6 },
  equipment_library: { width: 8, depth: 6 },
  theatre: { width: 7, depth: 6 },
  workshop: { width: 6, depth: 5 },
  single_room: { width: 4, depth: 4 },
  other: { width: 5, depth: 4 },
  store_room: { width: 3, depth: 3 },
};

export type PlanRoomInput = {
  id: string;
  gln: string;
  name: string;
  roomType: string;
  corridorPosition: number;
  corridorSide: "north" | "south";
};

export type PlanRoom = PlanRoomInput & {
  meshName: string; // room_<GLN>, as in the Blender model
  x: number; // centre
  z: number; // centre
  width: number; // along x
  depth: number; // along z
};

export type FloorPlan = { rooms: PlanRoom[]; corridor: { x: number; z: number; length: number; width: number } };

/** Rooms in corridor order on each side, packed along the corridor, centred on the origin. */
export function layoutFloor(rooms: PlanRoomInput[]): FloorPlan {
  const placed: PlanRoom[] = [];
  const sideLength = { north: 0, south: 0 };
  const ordered = [...rooms].sort((a, b) => a.corridorPosition - b.corridorPosition || a.corridorSide.localeCompare(b.corridorSide));
  for (const r of ordered) {
    const size = ROOM_SIZE[r.roomType] ?? ROOM_SIZE.other;
    const start = sideLength[r.corridorSide];
    const sign = r.corridorSide === "north" ? -1 : 1;
    placed.push({
      ...r,
      meshName: `room_${r.gln}`,
      x: start + size.width / 2,
      z: sign * (CORRIDOR_WIDTH / 2 + size.depth / 2),
      width: size.width,
      depth: size.depth,
    });
    sideLength[r.corridorSide] = start + size.width + GAP;
  }
  const length = Math.max(sideLength.north, sideLength.south, 1);
  const shift = length / 2;
  return {
    rooms: placed.map((r) => ({ ...r, x: r.x - shift })),
    corridor: { x: 0, z: 0, length, width: CORRIDOR_WIDTH },
  };
}

/**
 * Spots for `count` markers inside a room: a grid with a margin from the walls,
 * packed tighter when the room is crowded. Deterministic, so devices do not jump about.
 */
export function markerSpots(room: Pick<PlanRoom, "x" | "z" | "width" | "depth">, count: number): { x: number; z: number }[] {
  if (count === 0) return [];
  const margin = 0.5;
  const w = Math.max(room.width - 2 * margin, 0.5);
  const d = Math.max(room.depth - 2 * margin, 0.5);
  const cols = Math.min(count, Math.max(1, Math.ceil(Math.sqrt((count * w) / d))));
  const rows = Math.ceil(count / cols);
  const dx = cols > 1 ? w / (cols - 1) : 0;
  const dz = rows > 1 ? d / (rows - 1) : 0;
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    spots.push({
      x: room.x - (cols > 1 ? w / 2 : 0) + c * dx,
      z: room.z - (rows > 1 ? d / 2 : 0) + r * dz,
    });
  }
  return spots;
}

/** Spacing between neighbouring markers, so the marker size can shrink in crowded rooms. */
export function markerSpacing(room: Pick<PlanRoom, "width" | "depth">, count: number): number {
  if (count <= 1) return Infinity;
  const area = Math.max(room.width - 1, 0.5) * Math.max(room.depth - 1, 0.5);
  return Math.sqrt(area / count);
}

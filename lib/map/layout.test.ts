import { describe, expect, it } from "vitest";
import { buildSeedData } from "@/db/seed/build";
import { CORRIDOR_WIDTH, layoutFloor, markerSpacing, markerSpots, type PlanRoom } from "./layout";

const seed = buildSeedData("2026-10-27");
const floors = [...new Set(seed.rooms.map((r) => r.floorId))].map((floorId) =>
  layoutFloor(seed.rooms.filter((r) => r.floorId === floorId).map((r) => ({
    id: r.id!, gln: r.gln, name: r.name, roomType: r.roomType, corridorPosition: r.corridorPosition, corridorSide: r.corridorSide!,
  }))));

const overlaps = (a: PlanRoom, b: PlanRoom) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-9 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 - 1e-9;

describe("layoutFloor", () => {
  it("lays out every seeded room, named room_<GLN>", () => {
    expect(floors.flatMap((f) => f.rooms)).toHaveLength(40);
    for (const room of floors.flatMap((f) => f.rooms)) expect(room.meshName).toBe(`room_${room.gln}`);
  });

  it("never overlaps rooms, and keeps the corridor clear", () => {
    for (const floor of floors) {
      for (const [i, a] of floor.rooms.entries()) {
        for (const b of floor.rooms.slice(i + 1)) expect(overlaps(a, b), `${a.name} / ${b.name}`).toBe(false);
        expect(Math.abs(a.z) - a.depth / 2).toBeGreaterThanOrEqual(CORRIDOR_WIDTH / 2 - 1e-9);
      }
    }
  });

  it("puts north rooms on one side and south rooms on the other, in corridor order", () => {
    for (const floor of floors) {
      for (const r of floor.rooms) expect(Math.sign(r.z)).toBe(r.corridorSide === "north" ? -1 : 1);
      const north = floor.rooms.filter((r) => r.corridorSide === "north");
      expect(north.map((r) => r.x)).toEqual([...north.map((r) => r.x)].sort((a, b) => a - b));
    }
  });

  it("centres the floor on the origin, with the corridor spanning every room", () => {
    for (const floor of floors) {
      const left = Math.min(...floor.rooms.map((r) => r.x - r.width / 2));
      const right = Math.max(...floor.rooms.map((r) => r.x + r.width / 2));
      expect(left).toBeCloseTo(-floor.corridor.length / 2, 1);
      expect(right).toBeLessThanOrEqual(floor.corridor.length / 2 + 1e-9);
    }
  });
});

describe("markerSpots", () => {
  const ward = { x: 10, z: 4, width: 8, depth: 6 };

  it("keeps every marker inside the room, away from the walls, without duplicates", () => {
    for (const count of [1, 2, 7, 30, 90]) {
      const spots = markerSpots(ward, count);
      expect(spots).toHaveLength(count);
      for (const s of spots) {
        expect(Math.abs(s.x - ward.x)).toBeLessThanOrEqual(ward.width / 2 - 0.5 + 1e-9);
        expect(Math.abs(s.z - ward.z)).toBeLessThanOrEqual(ward.depth / 2 - 0.5 + 1e-9);
      }
      expect(new Set(spots.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`)).size).toBe(count);
    }
  });

  it("puts a single marker in the middle and is stable between calls", () => {
    expect(markerSpots(ward, 1)).toEqual([{ x: 10, z: 4 }]);
    expect(markerSpots(ward, 12)).toEqual(markerSpots(ward, 12));
  });

  it("packs markers closer as a room fills up", () => {
    expect(markerSpacing(ward, 4)).toBeGreaterThan(markerSpacing(ward, 40));
    expect(markerSpacing(ward, 1)).toBe(Infinity);
  });
});

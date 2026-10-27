// The Blender building (art track A1) must match the seeded rooms and the app's own layout,
// or device markers would land in the wrong room once M5 step 2 swaps it in.
// Reads the glTF JSON chunk of public/models/hospital.glb; the Draco geometry is not decoded.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSeedData } from "@/db/seed/build";
import { layoutFloor } from "@/lib/map/layout";

type GltfNode = { name?: string; children?: number[]; translation?: number[]; extras?: Record<string, unknown> };

function readGlbJson(path: string): { nodes: GltfNode[]; extensionsUsed?: string[] } {
  const buf = readFileSync(path);
  expect(buf.toString("ascii", 0, 4)).toBe("glTF");
  const length = buf.readUInt32LE(12);
  expect(buf.toString("ascii", 16, 20)).toBe("JSON");
  return JSON.parse(buf.toString("utf8", 20, 20 + length));
}

const gltf = readGlbJson("public/models/hospital.glb");
const byName = new Map(gltf.nodes.map((n, i) => [n.name, { node: n, index: i }]));
const data = buildSeedData("2026-10-27");

describe("public/models/hospital.glb", () => {
  it("uses Draco geometry", () => {
    expect(gltf.extensionsUsed).toContain("KHR_draco_mesh_compression");
  });

  for (const floor of data.floors) {
    const building = data.buildings.find((b) => b.id === floor.buildingId)!;
    const floorName = `floor_${building.code}_L${floor.level}`;
    const plan = layoutFloor(data.rooms.filter((r) => r.floorId === floor.id).map((r) => ({ ...r, id: r.id ?? r.gln })));

    it(`${floorName} holds every seeded room, where the map puts it`, () => {
      const floorNode = byName.get(floorName);
      expect(floorNode, floorName).toBeDefined();
      const children = new Set(floorNode!.node.children ?? []);
      expect(children.has(byName.get(`corridor_${building.code}_L${floor.level}`)?.index ?? -1)).toBe(true);

      for (const room of plan.rooms) {
        const found = byName.get(room.meshName);
        expect(found, room.meshName).toBeDefined();
        expect(children.has(found!.index), `${room.meshName} is under ${floorName}`).toBe(true);
        const [x, y, z] = found!.node.translation ?? [0, 0, 0];
        expect(x).toBeCloseTo(room.x, 3);
        expect(y).toBeCloseTo(0, 3);
        expect(z).toBeCloseTo(room.z, 3);
        expect(found!.node.extras).toMatchObject({ gln: room.gln, name: room.name, roomType: room.roomType });
        expect(byName.has(`walls_${room.gln}`)).toBe(true);
      }
    });
  }

  it("has no rooms that are not in the seed", () => {
    const seeded = new Set(data.rooms.map((r) => `room_${r.gln}`));
    const extra = gltf.nodes.map((n) => n.name ?? "").filter((n) => n.startsWith("room_") && !seeded.has(n));
    expect(extra).toEqual([]);
  });
});

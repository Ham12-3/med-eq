import { describe, expect, it } from "vitest";
import { describeDistance, distanceBetween, rankNearest } from "./nearest";

const origin = { buildingId: "main", level: 0, corridorPosition: 4 };
const at = (name: string, buildingId: string, level: number, corridorPosition: number, roomType = "ward") =>
  ({ name, buildingId, level, corridorPosition, roomType });

describe("rankNearest", () => {
  it("ranks same floor by rooms along, then other floors, then other buildings", () => {
    const ranked = rankNearest(origin, [
      at("other building", "opd", 0, 4),
      at("two floors up", "main", 2, 4),
      at("one floor up", "main", 1, 0),
      at("far along", "main", 0, 9),
      at("next door", "main", 0, 5),
    ]);
    expect(ranked.map((c) => c.name)).toEqual(["next door", "far along", "one floor up", "two floors up", "other building"]);
  });

  it("prefers the equipment library on a tie", () => {
    const ranked = rankNearest(origin, [at("ward", "main", 0, 6), at("library", "main", 0, 2, "equipment_library")]);
    expect(ranked.map((c) => c.name)).toEqual(["library", "ward"]);
  });

  it("does not change the input", () => {
    const input = [at("b", "main", 0, 9), at("a", "main", 0, 5)];
    rankNearest(origin, input);
    expect(input.map((c) => c.name)).toEqual(["b", "a"]);
  });
});

describe("describeDistance", () => {
  it("says how far away in plain words", () => {
    expect(describeDistance(distanceBetween(origin, at("", "main", 0, 4)))).toBe("Same corridor position");
    expect(describeDistance(distanceBetween(origin, at("", "main", 0, 5)))).toBe("1 room along");
    expect(describeDistance(distanceBetween(origin, at("", "main", 0, 1)))).toBe("3 rooms along");
    expect(describeDistance(distanceBetween(origin, at("", "main", 1, 4)))).toBe("1 floor away");
    expect(describeDistance(distanceBetween(origin, at("", "opd", 0, 4)))).toBe("Another building");
  });
});

// Nearest available device. PLAN.md section 5, "Nearest available".

export type Place = {
  buildingId: string;
  level: number;
  corridorPosition: number;
};

export type Candidate = Place & { roomType: string };

export type Distance = {
  sameBuilding: boolean;
  floorsAway: number;
  roomsAway: number; // along the corridor; only meaningful on the same floor
};

export function distanceBetween(origin: Place, place: Place): Distance {
  const sameBuilding = place.buildingId === origin.buildingId;
  const floorsAway = sameBuilding ? Math.abs(place.level - origin.level) : 0;
  return {
    sameBuilding,
    floorsAway,
    roomsAway: sameBuilding && floorsAway === 0 ? Math.abs(place.corridorPosition - origin.corridorPosition) : 0,
  };
}

/** Rank key: same floor first, then rooms along the corridor, then floors in the same building, then other buildings. */
function rankKey(origin: Place, c: Candidate): number[] {
  const d = distanceBetween(origin, c);
  const tier = !d.sameBuilding ? 2 : d.floorsAway === 0 ? 0 : 1;
  return [tier, d.floorsAway, d.roomsAway, c.roomType === "equipment_library" ? 0 : 1];
}

/** Sorts candidates nearest first. Ties go to the equipment library, whose stock is known to be ready. */
export function rankNearest<T extends Candidate>(origin: Place, candidates: readonly T[]): T[] {
  return candidates
    .map((c) => ({ c, key: rankKey(origin, c) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      return 0;
    })
    .map(({ c }) => c);
}

export function describeDistance(d: Distance): string {
  if (!d.sameBuilding) return "Another building";
  if (d.floorsAway > 0) return d.floorsAway === 1 ? "1 floor away" : `${d.floorsAway} floors away`;
  if (d.roomsAway === 0) return "Same corridor position";
  return d.roomsAway === 1 ? "1 room along" : `${d.roomsAway} rooms along`;
}

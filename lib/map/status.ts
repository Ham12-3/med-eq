// How each status looks on the map. Never colour alone: every status has its own marker
// shape, and the two that need action (do not use, recalled) also pulse and carry a "!" icon.

import { DISPLAY_TEXT, type DisplayStatus } from "@/lib/rules/assetStatus";

export const MAP_STATUSES = ["recalled", "do_not_use", "due_soon", "in_use", "available"] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];

export type MarkerShape = "sphere" | "cylinder" | "cone" | "octahedron" | "box";

export const MAP_STYLE: Record<MapStatus, { color: string; shape: MarkerShape; alert: boolean; label: string; shapeText: string }> = {
  recalled: { color: "#9f1239", shape: "box", alert: true, label: DISPLAY_TEXT.recalled, shapeText: "Square block, pulsing, with !" },
  do_not_use: { color: "#dc2626", shape: "octahedron", alert: true, label: DISPLAY_TEXT.do_not_use, shapeText: "Diamond, pulsing, with !" },
  due_soon: { color: "#d97706", shape: "cone", alert: false, label: DISPLAY_TEXT.due_soon, shapeText: "Cone" },
  in_use: { color: "#0284c7", shape: "cylinder", alert: false, label: DISPLAY_TEXT.in_use, shapeText: "Disc" },
  available: { color: "#059669", shape: "sphere", alert: false, label: DISPLAY_TEXT.available, shapeText: "Ball" },
};

/** Decommissioned devices are not shown on the map. */
export function isMapStatus(display: DisplayStatus): display is MapStatus {
  return (MAP_STATUSES as readonly string[]).includes(display);
}

export type MapMarker = {
  id: string;
  giai: string;
  modelName: string;
  roomId: string;
  roomName: string;
  status: MapStatus;
  reasons: string[];
  x: number;
  z: number;
  size: number; // marker radius in metres
  /** In "Show recall" mode: where this device stands on the chosen notice. */
  match: "open" | "actioned" | "not_affected" | null;
};

/** A device left out by the filters: drawn as a small grey dot so the room still reads as full. */
export type ContextDot = { x: number; z: number; size: number };

export const MATCH_TEXT = { open: "Waiting for action", actioned: "Actioned", not_affected: "Not affected" } as const;

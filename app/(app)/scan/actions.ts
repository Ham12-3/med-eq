"use server";

import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { authorizedWrite, getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/db/client";
import { getAssetSummaryByGiai, getRoomByGln, recordLocation, UUID } from "@/lib/data/assets";
import { todayInLondon } from "@/lib/dates";
import { parseScan } from "@/lib/gs1";
import type { DisplayStatus, Reason } from "@/lib/rules/assetStatus";

export type ScannedDevice = {
  kind: "device";
  id: string;
  giai: string;
  modelName: string;
  roomName: string | null;
  floorLabel: string | null;
  seenAt: string | null;
  doNotUse: boolean;
  reasons: Reason[];
  display: DisplayStatus;
  inUse: boolean;
  lifecycleStatus: string;
};
export type ScannedRoom = { kind: "room"; id: string; gln: string; name: string; floorLabel: string };
export type LookupResult = ScannedDevice | ScannedRoom | { kind: "error"; message: string };

/** Turns a scanned or typed code into a device or a room. Read-only, but still checks who is asking. */
export async function lookupCode(code: string): Promise<LookupResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "device.checkSafe")) return { kind: "error", message: "Please sign in again." };

  const parsed = parseScan(String(code).slice(0, 200));
  if (!parsed) return { kind: "error", message: "That is not a MedAsset device or room barcode." };

  const db = getDb();
  if (parsed.kind === "gln") {
    const room = await getRoomByGln(db, parsed.value);
    return room ? { kind: "room", ...room } : { kind: "error", message: `No room has the code ${parsed.value}.` };
  }
  const asset = await getAssetSummaryByGiai(db, parsed.value, todayInLondon());
  if (!asset) return { kind: "error", message: `No device has the code ${parsed.value}.` };
  return {
    kind: "device", id: asset.id, giai: asset.giai, modelName: asset.modelName, roomName: asset.roomName,
    floorLabel: asset.buildingName ? `${asset.buildingName}, ${asset.floorName}` : null, seenAt: asset.seenAt,
    doNotUse: asset.doNotUse, reasons: asset.reasons, display: asset.display, inUse: asset.inUse,
    lifecycleStatus: asset.lifecycleStatus,
  };
}

const Move = z.object({
  assetId: z.string().regex(UUID),
  roomId: z.string().regex(UUID),
  source: z.enum(["scan", "manual"]),
});

export type MoveResult = { ok: true; roomName: string } | { ok: false; message: string };

/** Writes a location event: the device was seen in this room now. */
export async function recordDeviceLocation(input: z.infer<typeof Move>): Promise<MoveResult> {
  const parsed = Move.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Scan the device and the room again." };
  try {
    return await authorizedWrite("location.record", async (tx, user) => {
      const room = await tx.query.rooms.findFirst({ where: (r, { eq, and }) => and(eq(r.id, parsed.data.roomId), eq(r.active, true)) });
      const asset = await tx.query.assets.findFirst({ where: (a, { eq }) => eq(a.id, parsed.data.assetId) });
      if (!room || !asset) return { ok: false, message: "That device or room no longer exists." };
      await recordLocation(tx, { ...parsed.data, userId: user.id });
      return { ok: true, roomName: room.name };
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save the location." };
  }
}

"use server";

import { refresh } from "next/cache";
import { authorizedWrite } from "@/lib/auth/session";
import { getAssetSummary, setInUse, UUID } from "@/lib/data/assets";
import { todayInLondon } from "@/lib/dates";

export type InUseState = { error?: string };

/** Ward staff tap "In use" or "Free" (PLAN.md Q4). A device that must not be used can only be freed. */
export async function setDeviceInUse(_prev: InUseState, formData: FormData): Promise<InUseState> {
  const assetId = String(formData.get("assetId") ?? "");
  const inUse = formData.get("inUse") === "true";
  if (!UUID.test(assetId)) return { error: "Unknown device." };

  const error = await authorizedWrite("device.markInUse", async (tx) => {
    const asset = await getAssetSummary(tx, assetId, todayInLondon());
    if (!asset) return "Unknown device.";
    if (inUse && asset.doNotUse) return "This device must not be used, so it cannot be marked in use.";
    if (asset.inUse !== inUse) await setInUse(tx, assetId, inUse);
    return undefined;
  });
  if (!error) refresh();
  return { error };
}

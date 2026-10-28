import { describe, expect, it } from "vitest";
import { buildSeedData } from "./build";
import { DEVICE_MODELS, INCIDENT_PLAN, REAL_BRAND_DENYLIST } from "./reference";

const TODAY = "2026-10-27";
const data = buildSeedData(TODAY);

describe("seed builder", () => {
  it("is deterministic for the same seed and date", () => {
    expect(JSON.stringify(buildSeedData(TODAY))).toBe(JSON.stringify(data));
  });

  it("changes with a different seed", () => {
    expect(buildSeedData(TODAY, 1).assets[0].serialNumber).not.toBe(undefined);
    expect(JSON.stringify(buildSeedData(TODAY, 1).assets)).not.toBe(JSON.stringify(data.assets));
  });

  it("builds the hospital the brief asks for", () => {
    expect(data.sites).toHaveLength(1);
    expect(data.buildings).toHaveLength(2);
    expect(data.floors).toHaveLength(3);
    expect(data.rooms).toHaveLength(40);
    expect(DEVICE_MODELS.filter((m) => !m.isTestEquipment)).toHaveLength(10);
  });

  it("has 400 clinical assets and 3 analysers", () => {
    const analyserModel = data.deviceModels.find((m) => m.isTestEquipment)!;
    expect(data.assets.filter((a) => a.deviceModelId !== analyserModel.id)).toHaveLength(400);
    expect(data.assets.filter((a) => a.deviceModelId === analyserModel.id)).toHaveLength(3);
  });

  it("dates nothing in the future", () => {
    const end = new Date(`${TODAY}T00:00:00Z`).getTime();
    for (const e of data.locationEvents) expect(e.occurredAt.getTime()).toBeLessThan(end);
    for (const wo of data.workOrders) {
      expect(wo.createdAt!.getTime()).toBeLessThan(end);
      if (wo.completedAt) expect(wo.completedAt.getTime()).toBeLessThan(end);
    }
  });

  it("keeps work order times in order", () => {
    for (const wo of data.workOrders) {
      if (wo.startedAt) expect(wo.startedAt.getTime()).toBeGreaterThanOrEqual(wo.createdAt!.getTime());
      if (wo.completedAt) expect(wo.completedAt.getTime()).toBeGreaterThanOrEqual(wo.startedAt!.getTime());
    }
  });

  it("puts each incident on a device of the model it describes", () => {
    expect(data.incidents).toHaveLength(INCIDENT_PLAN.length);
    const slugByModelId = new Map(data.deviceModels.map((m) => [m.id, m.slug]));
    const slugByAssetId = new Map(data.assets.map((a) => [a.id, slugByModelId.get(a.deviceModelId)]));
    for (const incident of data.incidents) {
      const planned = INCIDENT_PLAN.find((p) => p.description === incident.description)!;
      expect(slugByAssetId.get(incident.assetId!), incident.description).toBe(planned.model);
    }
    expect(new Set(data.incidents.map((i) => i.assetId)).size).toBe(data.incidents.length);
  });

  it("uses no real manufacturer names", () => {
    const text = [
      ...data.deviceModels.flatMap((m) => [m.name, m.manufacturer]),
      ...data.partsUsed.flatMap((p) => [p.supplier, p.description]),
    ].join(" | ").toLowerCase();
    for (const brand of REAL_BRAND_DENYLIST) expect(text, brand).not.toContain(brand);
  });
});

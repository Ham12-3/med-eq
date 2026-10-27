import { describe, expect, it } from "vitest";
import { closeBlockers, closeEffects, failedItems, type CloseInput, type EffectsInput } from "./workOrder";

const items = [
  { id: "vis", name: "Visual inspection", required: true, requiresAnalyser: false },
  { id: "pe", name: "Protective earth", required: true, requiresAnalyser: true },
  { id: "batt", name: "Battery", required: false, requiresAnalyser: false },
];
const pass = (id: string, analyser: string | null = null) => ({ templateItemId: id, phase: "after" as const, outcome: "pass" as const, analyserAssetId: analyser });
const ready: CloseInput = {
  type: "ppm",
  status: "in_progress",
  inspection: { clean: true, decontaminated: true, controlSettings: "Ward defaults" },
  items,
  results: [pass("vis"), pass("pe", "analyser-1")],
  unusableAnalyserIds: [],
};
const codes = (input: Partial<CloseInput>) => closeBlockers({ ...ready, ...input }).map((b) => b.code);

describe("closeBlockers", () => {
  it("lets a complete job close", () => {
    expect(codes({})).toEqual([]);
  });

  it("refuses a job that is already closed", () => {
    expect(codes({ status: "completed" })).toEqual(["NOT_OPEN"]);
    expect(codes({ status: "cancelled" })).toEqual(["NOT_OPEN"]);
  });

  it("needs every required test to have an after result", () => {
    expect(codes({ results: [pass("vis")] })).toEqual(["MISSING_RESULT"]);
    expect(codes({ results: [{ ...pass("pe", "analyser-1"), phase: "before" }, pass("vis")] })).toEqual(["MISSING_RESULT"]);
  });

  it("does not need optional tests", () => {
    expect(codes({ results: [pass("vis"), pass("pe", "analyser-1")] })).toEqual([]);
  });

  it("refuses not-applicable on a required test, but allows it on an optional one", () => {
    expect(codes({ results: [pass("vis"), { ...pass("pe", "analyser-1"), outcome: "not_applicable" }] })).toEqual(["NOT_APPLICABLE_ON_REQUIRED"]);
    expect(codes({ results: [...ready.results, { ...pass("batt"), outcome: "not_applicable" }] })).toEqual([]);
  });

  it("needs a usable analyser on tests that need one", () => {
    expect(codes({ results: [pass("vis"), pass("pe")] })).toEqual(["MISSING_ANALYSER"]);
    expect(codes({ unusableAnalyserIds: ["analyser-1"] })).toEqual(["ANALYSER_NOT_USABLE"]);
  });

  it("needs the initial inspection done, clean and decontaminated", () => {
    expect(codes({ inspection: null })).toEqual(["INSPECTION_INCOMPLETE"]);
    expect(codes({ inspection: { clean: true, decontaminated: false, controlSettings: "x" } })).toEqual(["INSPECTION_INCOMPLETE"]);
    expect(codes({ inspection: { clean: true, decontaminated: true, controlSettings: "  " } })).toEqual(["INSPECTION_INCOMPLETE"]);
  });

  it("lets a PPM close with a failed test (it will be quarantined)", () => {
    expect(codes({ results: [pass("vis"), { ...pass("pe", "analyser-1"), outcome: "fail" }] })).toEqual([]);
  });

  it("keeps a repair open while a test still fails, unless written off", () => {
    const failing = [pass("vis"), { ...pass("pe", "analyser-1"), outcome: "fail" as const }];
    expect(codes({ type: "repair", results: failing })).toEqual(["REPAIR_STILL_FAILING"]);
    expect(codes({ type: "repair", results: failing, choice: "beyond_economic_repair" })).toEqual([]);
  });

  it("still needs every test for a no-fault-found repair (CLAUDE.md)", () => {
    expect(codes({ type: "repair", choice: "no_fault_found", results: [pass("vis")] })).toEqual(["MISSING_RESULT"]);
    expect(codes({ type: "repair", choice: "no_fault_found" })).toEqual([]);
  });

  it("offers repair outcomes only on repairs", () => {
    expect(codes({ choice: "no_fault_found" })).toEqual(["BAD_CHOICE"]);
    expect(codes({ choice: "beyond_economic_repair" })).toEqual(["BAD_CHOICE"]);
  });

  it("needs the action recorded on a recall, but no inspection", () => {
    expect(codes({ type: "recall", inspection: null, items: [], results: [] })).toEqual(["RECALL_ACTION_MISSING"]);
    expect(codes({ type: "recall", inspection: null, items: [], results: [], actionNotes: "Firmware updated to 3.0.2" })).toEqual([]);
  });
});

describe("failedItems", () => {
  it("lists required items whose after result failed", () => {
    expect(failedItems({ items, results: [pass("vis"), { ...pass("pe", "a"), outcome: "fail" }, { ...pass("batt"), outcome: "fail" }] }))
      .toEqual(["Protective earth"]);
  });
});

describe("closeEffects", () => {
  const base: EffectsInput = {
    type: "ppm", failed: [], today: "2026-10-27", intervalMonths: 12, hasSchedule: true,
    currentLifecycle: "in_service", otherOpenRepair: false,
  };
  const effects = (e: Partial<EffectsInput>) => closeEffects({ ...base, ...e });

  it("rolls the PPM schedule forward from today on a pass", () => {
    expect(effects({})).toMatchObject({
      outcome: "returned_to_use", lifecycle: "in_service",
      schedule: { lastDoneOn: "2026-10-27", nextDueOn: "2027-10-27" }, followUpRepair: null,
    });
  });

  it("quarantines on a failed PPM, keeps the schedule and opens a repair (PLAN.md Q3)", () => {
    expect(effects({ failed: ["Protective earth"] })).toMatchObject({
      outcome: "failed_quarantined", lifecycle: "quarantined", schedule: null,
      followUpRepair: "Failed PPM: Protective earth",
    });
  });

  it("leaves a device out of service while another repair is open", () => {
    expect(effects({ currentLifecycle: "under_repair", otherOpenRepair: true }).lifecycle).toBe("under_repair");
  });

  it("puts an accepted device into service and creates its schedule", () => {
    expect(effects({ type: "acceptance", hasSchedule: false, currentLifecycle: "acceptance" })).toMatchObject({
      lifecycle: "in_service", createSchedule: true, setAcceptedNow: true,
      schedule: { lastDoneOn: "2026-10-27", nextDueOn: "2027-10-27" },
    });
  });

  it("returns a repaired device to service without touching the PPM dates", () => {
    expect(effects({ type: "repair", currentLifecycle: "under_repair" })).toMatchObject({ outcome: "returned_to_use", lifecycle: "in_service", schedule: null });
    expect(effects({ type: "repair", choice: "no_fault_found", currentLifecycle: "under_repair" }).outcome).toBe("no_fault_found");
  });

  it("decommissions a device written off as beyond economic repair", () => {
    expect(effects({ type: "repair", choice: "beyond_economic_repair" })).toMatchObject({
      outcome: "beyond_economic_repair", lifecycle: "decommissioned", deactivateSchedule: true, setDecommissionedNow: true,
    });
  });

  it("marks the safety notice match actioned when a recall closes", () => {
    expect(effects({ type: "recall" })).toMatchObject({ outcome: "actioned", markMatchActioned: true, lifecycle: "in_service" });
  });
});

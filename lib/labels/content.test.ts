import { describe, expect, it } from "vitest";
import { labelContent, type LabelJob } from "./content";

const closed: LabelJob = {
  number: "WO-000901", type: "ppm", status: "completed", outcome: "returned_to_use", completedOn: "2026-10-27",
  technicianInitials: "CO", giai: "0299999IVP000010", modelName: "Volumetric infusion pump VP-200", nextDueOn: "2027-10-27",
};

describe("labelContent", () => {
  it("prints SERVICED with the next due date for a device returned to use", () => {
    expect(labelContent(closed)).toEqual({
      kind: "serviced",
      title: "SERVICED",
      lines: [["Asset", "0299999IVP000010"], ["Date", "2026-10-27"], ["By", "CO"], ["Job", "WO-000901"], ["Next due", "2027-10-27"]],
      giai: "0299999IVP000010",
    });
  });

  it("prints SERVICED after a no-fault-found repair too", () => {
    expect(labelContent({ ...closed, type: "repair", outcome: "no_fault_found" })?.kind).toBe("serviced");
  });

  it("says when there is no PPM schedule", () => {
    expect(labelContent({ ...closed, nextDueOn: null })?.lines.at(-1)).toEqual(["Next due", "Not scheduled"]);
  });

  it("prints DO NOT USE for a failed test or a write-off", () => {
    expect(labelContent({ ...closed, outcome: "failed_quarantined" })).toMatchObject({ kind: "do_not_use", title: "DO NOT USE" });
    expect(labelContent({ ...closed, type: "repair", outcome: "beyond_economic_repair" })?.lines.at(-1)).toEqual(["Reason", "Beyond repair, for disposal"]);
  });

  it("prints nothing for an open job or a recall", () => {
    expect(labelContent({ ...closed, status: "in_progress", outcome: null, completedOn: null })).toBeNull();
    expect(labelContent({ ...closed, type: "recall", outcome: "actioned" })).toBeNull();
  });
});

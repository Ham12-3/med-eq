// M4 against the seeded test database: EM scores, safety notices, incidents and reports.
// Writes happen inside transactions that are rolled back.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser, type Db, type Tx } from "@/db/client";
import { loadActiveUser, type CurrentUser } from "@/lib/auth/users";
import { getAssetSummary } from "@/lib/data/assets";
import { listModelScores, recalculateEmScores, scoreFrom, updateEmParts } from "@/lib/data/em";
import { createIncident, getIncident, updateIncident } from "@/lib/data/incidents";
import { closeNotice, createNotice, getNotice, markNotAffected, type NoticeInput } from "@/lib/data/notices";
import { closeJob, JobError, saveActionNotes } from "@/lib/data/workOrders";
import { addDays } from "@/lib/dates";
import { SCHEDULED_PPM_THRESHOLD } from "@/lib/rules/emScore";
import { REPORTS } from "@/lib/reports/definitions";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

async function user(role: string): Promise<CurrentUser> {
  const [u] = await db.execute<{ id: string }>(sql`select id from users where role = ${role} and active order by name limit 1`);
  return (await loadActiveUser(db, u.id))!;
}

async function as(role: string, fn: (tx: Tx, u: CurrentUser) => Promise<void>) {
  const u = await user(role);
  await rolledBack(() => withUser(db, u.id, async (tx) => {
    await fn(tx, u);
    throw new Rollback();
  }));
}

async function modelId(tx: Db | Tx, slug: string) {
  const [m] = await tx.execute<{ id: string }>(sql`select id from device_models where slug = ${slug}`);
  return m.id;
}

describe("EM scores", () => {
  it("scores every model on the seeded day, once", async () => {
    const models = await listModelScores(db);
    expect(models).toHaveLength(11);
    expect(models.every((m) => m.calculatedOn === TEST_TODAY && m.total !== null)).toBe(true);
    await as("manager", async (tx) => {
      expect(await recalculateEmScores(tx, TEST_TODAY)).toBe(0);
      expect(await recalculateEmScores(tx, addDays(TEST_TODAY, 1))).toBe(11);
    });
  });

  it("adds the parts up, with incident history from failures per asset-year", async () => {
    for (const m of await listModelScores(db)) {
      expect(m.total).toBe(m.fn + m.risk + m.maintenance + m.incidentHistory!);
      expect(m.incidentHistory).toBeGreaterThanOrEqual(-2);
      expect(m.incidentHistory).toBeLessThanOrEqual(2);
    }
    expect(scoreFrom({ fn: 9, risk: 5, maintenance: 4, assets: 10, failures: 0 })).toEqual({ incidentHistory: -2, failuresPerAssetYear: 0, total: 16 });
    expect(scoreFrom({ fn: 9, risk: 5, maintenance: 4, assets: 10, failures: 60 }).incidentHistory).toBe(2); // 3 a year
  });

  it("keeps ventilators on scheduled PPM and beds below the threshold", async () => {
    const models = await listModelScores(db);
    expect(models.find((m) => m.slug === "ventilator")!.total).toBeGreaterThanOrEqual(SCHEDULED_PPM_THRESHOLD);
    expect(models.find((m) => m.slug === "hospital-bed")!.total).toBeLessThan(SCHEDULED_PPM_THRESHOLD);
  });

  it("re-scores straight away when the judged parts change, keeping the history", async () => {
    await as("manager", async (tx) => {
      const id = await modelId(tx, "hospital-bed");
      await updateEmParts(tx, id, { fn: 8, risk: 5, maintenance: 5 }, TEST_TODAY);
      const bed = (await listModelScores(tx)).find((m) => m.id === id)!;
      expect(bed.total).toBe(18 + bed.incidentHistory!);
      const [{ n }] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from em_score_history where device_model_id = ${id}`);
      expect(n).toBe(2);
    });
  });
});

describe("safety notices", () => {
  const notice = (criteria: NoticeInput["criteria"], extra: Partial<NoticeInput> = {}): NoticeInput => ({
    reference: "FSN/TEST/001", source: "fsn", title: "Occlusion alarm may not sound", description: "Test notice.",
    requiredAction: "Update firmware to 3.0.2", issuedOn: TEST_TODAY, deadline: addDays(TEST_TODAY, 30),
    quarantineRequired: true, criteria, ...extra,
  });

  it("matches by model, serial range and firmware, and opens a recall job for each device", async () => {
    await as("admin", async (tx, admin) => {
      const pump = await modelId(tx, "volumetric-infusion-pump");
      const expected = await tx.execute<{ id: string }>(sql`
        select id from assets where device_model_id = ${pump} and lifecycle_status <> 'decommissioned'
          and firmware_version = '2.3.4' and serial_number between 'VP2-0100100' and 'VP2-0100400'`);
      expect(expected.length).toBeGreaterThan(0);

      const created = await createNotice(tx, admin, notice([{ deviceModelId: pump, serialFrom: "VP2-0100100", serialTo: "VP2-0100400", firmwareVersions: ["2.3.4"] }]));
      expect(created.matched).toBe(expected.length);

      const saved = (await getNotice(tx, created.id))!;
      expect(new Set(saved.matches.map((m) => m.assetId))).toEqual(new Set(expected.map((e) => e.id)));
      expect(saved.matches.every((m) => m.status === "open" && m.jobNumber && m.jobStatus === "open")).toBe(true);

      // Quarantine: every matched device is now recalled and "Do not use".
      const asset = (await getAssetSummary(tx, saved.matches[0].assetId, TEST_TODAY))!;
      expect(asset).toMatchObject({ display: "recalled", doNotUse: true });
      expect(asset.reasons).toContain("SAFETY_NOTICE");
    });
  });

  it("leaves devices usable when the notice is advisory", async () => {
    await as("admin", async (tx, admin) => {
      const created = await createNotice(tx, admin, notice([{ deviceModelId: await modelId(tx, "ecg-machine"), serialFrom: null, serialTo: null, firmwareVersions: null }], { quarantineRequired: false }));
      const saved = (await getNotice(tx, created.id))!;
      const asset = (await getAssetSummary(tx, saved.matches[0].assetId, TEST_TODAY))!;
      expect(asset.reasons).not.toContain("SAFETY_NOTICE");
    });
  });

  it("tracks the notice to closure through recall jobs and not-affected decisions", async () => {
    await as("admin", async (tx, admin) => {
      const ecg = await modelId(tx, "ecg-machine");
      const created = await createNotice(tx, admin, notice([{ deviceModelId: ecg, serialFrom: null, serialTo: null, firmwareVersions: null }]));
      let saved = (await getNotice(tx, created.id))!;
      await expect(closeNotice(tx, created.id)).rejects.toThrow(/still waiting/);

      const [first, ...rest] = saved.matches;
      // A recall job needs the action recorded before it closes.
      const blocked = await closeJob(tx, first.jobId!, admin, { today: TEST_TODAY });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.blockers.map((b) => b.code)).toEqual(["RECALL_ACTION_MISSING"]);
      await saveActionNotes(tx, first.jobId!, admin, "Firmware updated and alarm tested");
      expect(await closeJob(tx, first.jobId!, admin, { today: TEST_TODAY })).toEqual({ ok: true, outcome: "actioned", followUp: null });

      for (const m of rest) await markNotAffected(tx, admin, m.id, "Serial checked on the device: outside the range");
      saved = (await getNotice(tx, created.id))!;
      expect(saved.matches[0].status).toBe("actioned");
      expect(saved.matches.filter((m) => m.status === "not_affected")).toHaveLength(rest.length);
      expect(saved.matches.filter((m) => m.status === "not_affected").every((m) => m.jobStatus === "cancelled")).toBe(true);

      await closeNotice(tx, created.id);
      expect((await getNotice(tx, created.id))!.status).toBe("closed");
      expect((await getAssetSummary(tx, first.assetId, TEST_TODAY))!.reasons).not.toContain("SAFETY_NOTICE");
    });
  });

  it("refuses duplicates, backwards serial ranges and notices with no devices", async () => {
    await as("admin", async (tx, admin) => {
      const pump = await modelId(tx, "volumetric-infusion-pump");
      await expect(createNotice(tx, admin, notice([]))).rejects.toThrow(JobError);
      await expect(createNotice(tx, admin, notice([{ deviceModelId: pump, serialFrom: "VP2-0100400", serialTo: "VP2-0100100", firmwareVersions: null }]))).rejects.toThrow(/backwards/);
      await createNotice(tx, admin, notice([{ deviceModelId: pump, serialFrom: "VP2-9999990", serialTo: null, firmwareVersions: null }]));
      await expect(createNotice(tx, admin, notice([{ deviceModelId: pump, serialFrom: null, serialTo: null, firmwareVersions: null }]))).rejects.toThrow(/already logged/);
    });
  });
});

describe("incidents", () => {
  it("has seeded incidents, some reported to the MHRA", async () => {
    const [{ total, reported, bad }] = await db.execute<{ total: number; reported: number; bad: number }>(sql`
      select count(*)::int as total, count(*) filter (where reported_to_mhra)::int as reported,
             count(*) filter (where reference !~ '^INC-[0-9]{5}$')::int as bad from incidents`);
    expect(total).toBe(12);
    expect(reported).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });

  it("logs an incident against a device and reports it with a Yellow Card", async () => {
    await as("admin", async (tx, admin) => {
      const [asset] = await tx.execute<{ giai: string }>(sql`select giai from assets limit 1`);
      const created = await createIncident(tx, admin, {
        giai: asset.giai.toLowerCase(), roomId: null, occurredAt: new Date(Date.now() - 3_600_000),
        description: "Alarm silent during test", harmLevel: "no_harm",
      });
      expect(created.reference).toMatch(/^INC-\d{5}$/);
      await expect(updateIncident(tx, created.id, { status: "open", harmLevel: "low", reportedToMhra: true, yellowCardRef: null, reportedToMhraAt: null }))
        .rejects.toThrow(/Yellow Card reference/);
      await updateIncident(tx, created.id, { status: "under_investigation", harmLevel: "low", reportedToMhra: true, yellowCardRef: "YC-123456", reportedToMhraAt: new Date() });
      expect(await getIncident(tx, created.id)).toMatchObject({ status: "under_investigation", reportedToMhra: true, yellowCardRef: "YC-123456", giai: asset.giai });
      await expect(createIncident(tx, admin, { giai: "0299999NOPE00001", roomId: null, occurredAt: new Date(), description: "x x x", harmLevel: "low" })).rejects.toThrow(/No device/);
      await expect(createIncident(tx, admin, { giai: null, roomId: null, occurredAt: new Date(Date.now() + 86_400_000), description: "x x x", harmLevel: "low" })).rejects.toThrow(/future/);
    });
  });
});

describe("reports", () => {
  it("runs every report", async () => {
    for (const report of REPORTS) {
      const rows = await report.load(db, TEST_TODAY);
      expect(Array.isArray(rows), report.slug).toBe(true);
      for (const row of rows) for (const c of report.columns) expect(c.key in row, `${report.slug}.${c.key}`).toBe(true);
    }
  });

  it("agrees with the seed: 8 % overdue, 32 devices on the overdue list", async () => {
    const compliance = await REPORTS.find((r) => r.slug === "ppm-compliance")!.load(db, TEST_TODAY);
    const all = compliance.find((r) => r.breakdown === "All")!;
    expect(all.overdue).toBe(32);
    expect(all.compliance).toBeCloseTo(100 * (Number(all.schedules) - 32) / Number(all.schedules), 1);
    const overdue = await REPORTS.find((r) => r.slug === "overdue-ppm")!.load(db, TEST_TODAY);
    expect(overdue).toHaveLength(32);
    expect(overdue.every((r) => Number(r.daysOverdue) > 0)).toBe(true);
  });

  it("finds failed tests, repairs and end-of-life devices", async () => {
    const load = (slug: string) => REPORTS.find((r) => r.slug === slug)!.load(db, TEST_TODAY);
    expect((await load("failed-tests")).length).toBeGreaterThan(0);
    const mttr = await load("mean-time-to-repair");
    expect(mttr[0].model).toBe("All models");
    expect(Number(mttr[0].repairs)).toBeGreaterThan(0);
    expect((await load("end-of-life")).length).toBeGreaterThan(10);
  });
});

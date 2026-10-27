// Builds every seed row in memory, deterministically from (seed, today).
// db/seed/index.ts inserts the result. Nothing here touches the database.

import { fakerEN_GB as faker } from "@faker-js/faker";
import {
  addDays, addMonths, addYears, atTime, daysBetween, type IsoDate,
} from "@/lib/dates";
import { makeGiai, makeGln } from "@/lib/gs1";
import { emScore } from "@/lib/rules/emScore";
import { isOverdue, needsPpmWorkOrder } from "@/lib/rules/ppm";
import { ppmPriority, repairPriority } from "@/lib/rules/priority";
import { measurementOutcome } from "@/lib/rules/testResult";
import type * as s from "../schema";
import { createRng } from "./random";
import {
  BUILDINGS, DEPARTMENTS, DEVICE_MODELS, PART_SUPPLIERS, SITE, SYSTEM_USER_ID, USER_PLAN,
  type DeptCode, type DeviceModelSpec, type ElectricalSpec, type MeasurementSpec, type TestSpec,
} from "./reference";

export const DEFAULT_SEED = 20261027;

export type SeedData = {
  departments: (typeof s.departments.$inferInsert)[];
  users: (typeof s.users.$inferInsert)[];
  sites: (typeof s.sites.$inferInsert)[];
  buildings: (typeof s.buildings.$inferInsert)[];
  floors: (typeof s.floors.$inferInsert)[];
  rooms: (typeof s.rooms.$inferInsert)[];
  testTemplates: (typeof s.testTemplates.$inferInsert)[];
  testTemplateItems: (typeof s.testTemplateItems.$inferInsert)[];
  deviceModels: (typeof s.deviceModels.$inferInsert)[];
  assets: (typeof s.assets.$inferInsert)[];
  ppmSchedules: (typeof s.ppmSchedules.$inferInsert)[];
  workOrders: (typeof s.workOrders.$inferInsert)[];
  testResults: (typeof s.testResults.$inferInsert)[];
  partsUsed: (typeof s.partsUsed.$inferInsert)[];
  locationEvents: (typeof s.locationEvents.$inferInsert)[];
  libraryMovements: (typeof s.libraryMovements.$inferInsert)[];
  incidents: (typeof s.incidents.$inferInsert)[];
};

type Role = (typeof USER_PLAN)[number]["role"];
type AssetState = "normal" | "acceptance" | "decommissioned" | "under_repair" | "fault_on_ward" | "quarantined" | "overdue";
type Outcome = NonNullable<(typeof s.workOrders.$inferInsert)["outcome"]>;

type PlacedRoom = { id: string; key: string; type: string; dept: DeptCode };

type ItemInfo = {
  id: string;
  code: string;
  name: string;
  group: "inspection" | "calibration" | "electrical_safety" | "performance";
  kind: "measurement" | "check";
  unit: string | null;
  lower: number | null;
  upper: number | null;
  required: boolean;
  requiresAnalyser: boolean;
  typical?: [number, number];
  fail?: number;
  decimals?: number;
};

type ModelInfo = { id: string; templateId: string; items: ItemInfo[]; baseEm: number };

type Draft = {
  id: string;
  spec: DeviceModelSpec;
  purchaseDate: IsoDate;
  homeRoom: string;
  state: AssetState;
  historicalFailure: boolean;
};

type Event = { at: Date; roomKey: string; byUserId: string };

const INSPECTED: s.InspectionRecord = {
  clean: true,
  decontaminated: true,
  controlSettings: "Checked and restored to ward defaults",
};

const HOUR_MS = 3_600_000;

const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
const plusMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

function electricalItems(e: ElectricalSpec): MeasurementSpec[] {
  const items: MeasurementSpec[] = [];
  if (e.class === "I") {
    items.push({ kind: "measurement", code: "PE", name: "Protective earth resistance", unit: "Ω", upper: 0.3, typical: [0.03, 0.18], fail: 0.52, decimals: 3 });
  }
  items.push(e.class === "I"
    ? { kind: "measurement", code: "EL", name: "Equipment leakage current (direct)", unit: "µA", upper: 500, typical: [20, 240], fail: 640, decimals: 0 }
    : { kind: "measurement", code: "EL", name: "Equipment leakage current (direct)", unit: "µA", upper: 100, typical: [3, 45], fail: 160, decimals: 0 });
  if (e.appliedPart === "CF") {
    items.push({ kind: "measurement", code: "APL", name: "Applied part leakage current, type CF (direct)", unit: "µA", upper: 50, typical: [1, 18], fail: 72, decimals: 1 });
  } else if (e.appliedPart === "BF") {
    items.push({ kind: "measurement", code: "APL", name: "Applied part leakage current, type BF (direct)", unit: "µA", upper: 5000, typical: [2, 90], fail: 5600, decimals: 1 });
  }
  return items;
}

export function buildSeedData(today: IsoDate, seed: number = DEFAULT_SEED): SeedData {
  const rng = createRng(seed);
  faker.seed(seed);

  const yesterday = addDays(today, -1);
  const windowStart = addMonths(today, -18);

  const data: SeedData = {
    departments: [], users: [], sites: [], buildings: [], floors: [], rooms: [],
    testTemplates: [], testTemplateItems: [], deviceModels: [], assets: [], ppmSchedules: [],
    workOrders: [], testResults: [], partsUsed: [], locationEvents: [], libraryMovements: [], incidents: [],
  };

  // ---------- departments and users ----------
  const deptId = {} as Record<DeptCode, string>;
  for (const d of DEPARTMENTS) {
    deptId[d.code] = rng.uuid();
    data.departments.push({ id: deptId[d.code], code: d.code, name: d.name });
  }

  data.users.push({
    id: SYSTEM_USER_ID, email: "system@northbrook.example", name: "MedAsset System",
    initials: "SYS", role: "admin", departmentId: null, active: false,
  });
  const usersByRole: Record<Role, { id: string; dept: DeptCode }[]> = {
    technician: [], manager: [], ward: [], library: [], admin: [],
  };
  const emails = new Set<string>();
  for (const plan of USER_PLAN) {
    for (let i = 0; i < plan.count; i++) {
      const first = faker.person.firstName();
      const last = faker.person.lastName();
      const local = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
      let email = `${local}@northbrook.example`;
      for (let n = 2; emails.has(email); n++) email = `${local}${n}@northbrook.example`;
      emails.add(email);
      const id = rng.uuid();
      data.users.push({
        id, email, name: `${first} ${last}`,
        initials: (first[0] + last.replace(/[^A-Za-z]/g, "")[0]).toUpperCase(),
        role: plan.role, departmentId: deptId[plan.dept],
      });
      usersByRole[plan.role].push({ id, dept: plan.dept });
    }
  }
  const technician = () => rng.pick(usersByRole.technician).id;
  const wardUser = (dept: DeptCode) => {
    const local = usersByRole.ward.filter((u) => u.dept === dept);
    return rng.pick(local.length ? local : usersByRole.ward).id;
  };
  const libraryUser = () => rng.pick(usersByRole.library).id;

  // ---------- places ----------
  const siteId = rng.uuid();
  data.sites.push({ id: siteId, gln: makeGln(SITE.locationRef), name: SITE.name });

  const roomByKey = new Map<string, PlacedRoom>();
  for (const b of BUILDINGS) {
    const buildingId = rng.uuid();
    data.buildings.push({ id: buildingId, siteId, code: b.code, name: b.name });
    for (const f of b.floors) {
      const floorId = rng.uuid();
      data.floors.push({ id: floorId, buildingId, level: f.level, name: f.name });
      f.rooms.forEach((r, i) => {
        const id = rng.uuid();
        const gln = makeGln(f.locationRefBase + i + 1);
        data.rooms.push({
          id, floorId, departmentId: deptId[r.dept], gln, meshId: `room_${gln}`, name: r.name,
          roomType: r.type, corridorPosition: Math.floor(i / 2), corridorSide: i % 2 === 0 ? "north" : "south",
        });
        roomByKey.set(r.key, { id, key: r.key, type: r.type, dept: r.dept });
      });
    }
  }
  const room = (key: string): PlacedRoom => {
    const r = roomByKey.get(key);
    if (!r) throw new Error(`Unknown room key: ${key}`);
    return r;
  };

  // ---------- test templates and device models ----------
  const models = new Map<string, ModelInfo>();
  for (const spec of DEVICE_MODELS) {
    const templateId = rng.uuid();
    data.testTemplates.push({
      id: templateId, code: `PPM-${spec.code}`, version: 1,
      name: `${spec.name} PPM and safety test`,
      standard: spec.electrical ? "BS EN 62353" : null,
    });

    const groups: [ItemInfo["group"], TestSpec[]][] = [
      ["inspection", [
        { kind: "check", code: "VIS", name: "Visual inspection: casing, cables, plug and fuse" },
        { kind: "check", code: "LBL", name: "Labels and markings legible" },
      ]],
      ["electrical_safety", spec.electrical ? electricalItems(spec.electrical) : []],
      [spec.isTestEquipment ? "calibration" : "performance", spec.performance],
    ];
    const items: ItemInfo[] = [];
    for (const [group, tests] of groups) {
      for (const t of tests) {
        const isMeasurement = t.kind === "measurement";
        items.push({
          id: rng.uuid(), code: t.code, name: t.name, group, kind: t.kind,
          unit: isMeasurement ? t.unit : null,
          lower: isMeasurement ? t.lower ?? null : null,
          upper: isMeasurement ? t.upper ?? null : null,
          required: t.required ?? true,
          requiresAnalyser: isMeasurement,
          ...(isMeasurement ? { typical: t.typical, fail: t.fail, decimals: t.decimals } : {}),
        });
      }
    }
    items.forEach((item, position) => {
      data.testTemplateItems.push({
        id: item.id, templateId, position, code: item.code, name: item.name, group: item.group,
        kind: item.kind, unit: item.unit,
        lowerLimit: item.lower === null ? null : String(item.lower),
        upperLimit: item.upper === null ? null : String(item.upper),
        required: item.required, requiresAnalyser: item.requiresAnalyser,
      });
    });

    const [fn, risk, maintenance] = spec.em;
    const modelId = rng.uuid();
    data.deviceModels.push({
      id: modelId, slug: spec.slug, name: spec.name, manufacturer: spec.manufacturer, category: spec.category,
      ppmIntervalMonths: spec.intervalMonths, ppmIntervalReason: spec.intervalReason ?? null,
      testTemplateId: templateId, emFunction: fn, emPhysicalRisk: risk, emMaintenance: maintenance,
      widthCm: spec.sizeCm[0], depthCm: spec.sizeCm[1], heightCm: spec.sizeCm[2],
      isTestEquipment: spec.isTestEquipment ?? false,
    });
    models.set(spec.slug, {
      id: modelId, templateId, items,
      baseEm: emScore({ function: fn, physicalRisk: risk, maintenance, incidentHistory: 0 }),
    });
  }

  // ---------- asset drafts and their designated states ----------
  const drafts: Draft[] = [];
  for (const spec of DEVICE_MODELS) {
    for (let i = 0; i < spec.count; i++) {
      drafts.push({
        id: rng.uuid(), spec,
        purchaseDate: addDays(today, -rng.int(120, 365 * 9)),
        homeRoom: rng.weighted(spec.placement),
        state: "normal", historicalFailure: false,
      });
    }
  }
  const analyserIds = drafts.filter((d) => d.spec.isTestEquipment).map((d) => d.id);

  const clinical = rng.shuffle(drafts.filter((d) => !d.spec.isTestEquipment));
  const oldEnough = (d: Draft) => d.purchaseDate <= addMonths(today, -14);
  const onWard = (d: Draft) => ["ward", "single_room"].includes(room(d.homeRoom).type);
  const designate = (count: number, eligible: (d: Draft) => boolean, apply: (d: Draft) => void) => {
    let done = 0;
    for (const d of clinical) {
      if (done === count) break;
      if (d.state === "normal" && !d.historicalFailure && eligible(d)) {
        apply(d);
        done++;
      }
    }
    if (done < count) throw new Error(`Could only designate ${done} of ${count} assets`);
  };
  designate(5, () => true, (d) => {
    d.state = "acceptance";
    d.purchaseDate = addDays(today, -rng.int(3, 20));
  });
  designate(4, (d) => d.purchaseDate <= addYears(today, -8), (d) => { d.state = "decommissioned"; });
  designate(8, oldEnough, (d) => { d.state = "under_repair"; });
  designate(3, (d) => oldEnough(d) && onWard(d), (d) => { d.state = "fault_on_ward"; });
  designate(6, oldEnough, (d) => { d.state = "quarantined"; });
  designate(32, oldEnough, (d) => { d.state = "overdue"; }); // 8 % of 400
  designate(8, oldEnough, (d) => { d.historicalFailure = true; });

  // ---------- simulate each asset's history ----------
  type WoRow = typeof s.workOrders.$inferInsert;
  const workOrders: Omit<WoRow, "number">[] = [];

  for (const spec of DEVICE_MODELS) {
    const model = models.get(spec.slug)!;
    const ofModel = drafts.filter((d) => d.spec === spec).sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

    ofModel.forEach((d, index) => {
      const seq = index + 1;
      const I = spec.intervalMonths;
      const home = room(d.homeRoom);
      const owner = spec.owner === "room" ? home.dept : spec.owner;
      const libraryOwned = owner === "LIB"; // pumps and drivers, plus anything else placed in the library
      const events: Event[] = [];
      const scanner = (roomKey: string) => {
        const r = room(roomKey);
        if (r.type === "workshop" || r.dept === "EBME") return technician();
        if (r.type === "equipment_library") return libraryUser();
        return rng.chance(0.5) && libraryOwned ? libraryUser() : wardUser(r.dept);
      };
      const move = (at: Date, roomKey: string) => events.push({ at, roomKey, byUserId: scanner(roomKey) });

      // asset row
      const acquisitionRoll = rng.next();
      const acquisitionType = acquisitionRoll < 0.9 ? "purchased" : acquisitionRoll < 0.96 ? "leased" : acquisitionRoll < 0.99 ? "manufacturer_loan" : "donated";
      let firmwareVersion: string | null = null;
      if (spec.firmware) {
        const byAge = Math.min(spec.firmware.length - 1, Math.floor((index / ofModel.length) * spec.firmware.length));
        firmwareVersion = rng.chance(0.4) ? spec.firmware[spec.firmware.length - 1] : spec.firmware[byAge];
      }
      const asset: typeof s.assets.$inferInsert = {
        id: d.id,
        giai: makeGiai(`${spec.code}${String(seq).padStart(6, "0")}`),
        serialNumber: `${spec.serialPrefix}${String(100_000 + seq * 7 + rng.int(0, 6)).padStart(7, "0")}`,
        deviceModelId: model.id,
        ownerDepartmentId: deptId[owner],
        lifecycleStatus: "in_service",
        acquisitionType,
        purchaseDate: d.purchaseDate,
        purchasePricePence: acquisitionType === "purchased" || acquisitionType === "leased"
          ? rng.int(spec.pricePounds[0], spec.pricePounds[1]) * 100 : null,
        endOfLifeDate: addYears(d.purchaseDate, spec.lifespanYears),
        firmwareVersion,
      };
      data.assets.push(asset);

      // shared work order helpers
      const pushResults = (workOrderId: string, at: Date, by: string, failing: boolean): string | null => {
        let failCode: string | null = null;
        if (failing) {
          const measurements = model.items.filter((i) => i.kind === "measurement");
          failCode = rng.pick(measurements.length ? measurements : model.items.filter((i) => i.group !== "inspection")).code;
        }
        for (const item of model.items) {
          if (!item.required && !rng.chance(0.6)) continue;
          const isFailing = item.code === failCode;
          let measuredValue: string | null = null;
          let outcome: "pass" | "fail";
          if (item.kind === "measurement") {
            const raw = isFailing ? item.fail! : rng.float(item.typical![0], item.typical![1]);
            const value = Number(raw.toFixed(item.decimals));
            measuredValue = value.toFixed(item.decimals);
            outcome = measurementOutcome(value, item.lower, item.upper);
          } else {
            outcome = isFailing ? "fail" : "pass";
          }
          data.testResults.push({
            id: rng.uuid(), workOrderId, templateItemId: item.id, phase: "after",
            measuredValue, unit: item.unit,
            lowerLimit: item.lower === null ? null : String(item.lower),
            upperLimit: item.upper === null ? null : String(item.upper),
            outcome,
            analyserAssetId: item.requiresAnalyser ? rng.pick(analyserIds) : null,
            recordedById: by, recordedAt: at,
            notes: isFailing ? "Outside limits. Device withdrawn from use." : null,
          });
        }
        return failCode;
      };

      const pushParts = (workOrderId: string, at: Date, by: string) => {
        const count = rng.int(1, Math.min(2, spec.parts.length));
        for (const part of rng.shuffle(spec.parts).slice(0, count)) {
          data.partsUsed.push({
            id: rng.uuid(), workOrderId, partNumber: part.partNumber, description: part.description,
            supplier: rng.pick(PART_SUPPLIERS), lotNumber: `L${rng.int(20_000, 99_999)}`,
            quantity: 1, recordedById: by, recordedAt: at,
          });
        }
      };

      const completedWorkOrder = (o: {
        type: "ppm" | "repair" | "acceptance";
        createdAt: Date;
        doneOn: IsoDate;
        outcome: Outcome;
        dueOn?: IsoDate | null;
        assignee?: string;
        reportedById?: string;
        faultReason?: string | null;
        failing?: boolean;
        parts?: boolean;
        scheduleId?: string | null;
      }) => {
        const id = rng.uuid();
        const assignee = o.assignee ?? technician();
        let completedAt = atTime(o.doneOn, rng.int(9, 15), rng.int(0, 59));
        if (completedAt <= o.createdAt) completedAt = plusMinutes(o.createdAt, rng.int(60, 240));
        const startedAt = new Date(Math.max(o.createdAt.getTime(), completedAt.getTime() - rng.int(40, 180) * 60_000));
        workOrders.push({
          id, type: o.type, status: "completed",
          priority: o.type === "repair" ? repairPriority(spec.category) : o.type === "ppm" ? ppmPriority(model.baseEm, false) : "normal",
          assetId: d.id, ppmScheduleId: o.type === "ppm" ? o.scheduleId ?? null : null,
          testTemplateId: model.templateId, assigneeId: assignee, reportedById: o.reportedById ?? assignee,
          faultReason: o.faultReason ?? null, inspection: INSPECTED, outcome: o.outcome,
          dueOn: o.dueOn ?? null, createdAt: o.createdAt, startedAt, completedAt, closedById: assignee,
        });
        const failCode = pushResults(id, completedAt, assignee, o.failing ?? false);
        if (o.parts) pushParts(id, completedAt, assignee);
        return { id, completedAt, assignee, failCode };
      };

      // ---------- acceptance-state assets: just delivered ----------
      if (d.state === "acceptance") {
        asset.lifecycleStatus = "acceptance";
        const createdAt = atTime(addDays(d.purchaseDate, 1), 9, rng.int(0, 59));
        move(plusMinutes(createdAt, 30), "ebme-workshop");
        const assignee = technician();
        const started = rng.chance(0.5);
        workOrders.push({
          id: rng.uuid(), type: "acceptance", status: started ? "in_progress" : "open", priority: "normal",
          assetId: d.id, testTemplateId: model.templateId, assigneeId: assignee, reportedById: assignee,
          dueOn: addDays(d.purchaseDate, 14), createdAt, startedAt: started ? plusMinutes(createdAt, 90) : null,
        });
        pushEvents(d.id, events, false); // still in acceptance, not yet library stock
        return;
      }

      // ---------- everything else was accepted and has a PPM schedule ----------
      const acceptedOn = addDays(d.purchaseDate, rng.int(3, 21));
      asset.acceptedAt = atTime(acceptedOn, 11);
      move(atTime(addDays(d.purchaseDate, 1), 9, 30), "ebme-workshop");
      move(atTime(addDays(acceptedOn, 1), 10), d.homeRoom);

      // the date after which this asset's ordinary history stops, by state
      let historyEnd = addDays(today, -2);
      let openCreatedOn: IsoDate | null = null;
      let failedOn: IsoDate | null = null;
      let berOn: IsoDate | null = null;
      if (d.state === "under_repair") openCreatedOn = addDays(today, -rng.int(1, 10));
      if (d.state === "fault_on_ward") openCreatedOn = addDays(today, -rng.int(1, 2));
      if (d.state === "quarantined") failedOn = addDays(today, -rng.int(2, 20));
      if (d.state === "decommissioned") berOn = addDays(today, -rng.int(20, 300));
      const cutOff = openCreatedOn ?? failedOn ?? berOn;
      if (cutOff) historyEnd = addDays(cutOff, -14);

      // next due date by state (PLAN.md 3.1)
      let nextDue: IsoDate;
      if (berOn) nextDue = addDays(berOn, rng.int(5, 60));
      else if (d.state === "overdue") nextDue = addDays(today, -rng.int(3, 75));
      else if (d.state === "quarantined") nextDue = addDays(today, rng.int(1, 12));
      else if (acceptedOn > addMonths(today, -I)) nextDue = addMonths(acceptedOn, I);
      else nextDue = addDays(today, rng.int(0, daysBetween(today, addMonths(today, I)) - 1));

      // walk back from the next due date to build the PPM history
      const chain: { due: IsoDate; done: IsoDate; failDays?: number }[] = [];
      let lastDoneOn: IsoDate | null = null;
      for (let dueNext = nextDue; ;) {
        const done = addMonths(dueNext, -I);
        if (done < addDays(acceptedOn, 30)) break;
        lastDoneOn ??= done;
        if (done < windowStart) break;
        const due = addDays(done, rng.int(-4, 12));
        chain.unshift({ due, done });
        dueNext = due;
      }
      if (lastDoneOn) nextDue = addMonths(lastDoneOn, I);
      if (d.historicalFailure && chain.length >= 1) chain[rng.int(0, chain.length - 1)].failDays = rng.int(1, 10);

      const scheduleId = rng.uuid();
      data.ppmSchedules.push({
        id: scheduleId, assetId: d.id, intervalMonths: I, lastDoneOn, nextDueOn: nextDue,
        active: d.state !== "decommissioned",
      });

      if (acceptedOn >= windowStart) {
        completedWorkOrder({
          type: "acceptance", createdAt: atTime(addDays(d.purchaseDate, 1), 9), doneOn: acceptedOn,
          outcome: "returned_to_use", dueOn: addDays(d.purchaseDate, 14),
        });
      }

      let lastPpmOn: IsoDate | null = null;
      for (const c of chain) {
        const createdAt = atTime(minDate(addDays(c.due, -14), c.done), 6);
        if (c.failDays) {
          const failOn = addDays(c.done, -c.failDays);
          const failed = completedWorkOrder({
            type: "ppm", createdAt, doneOn: failOn, outcome: "failed_quarantined",
            dueOn: c.due, failing: true, scheduleId,
          });
          const failedItem = model.items.find((i) => i.code === failed.failCode)!;
          const repair = completedWorkOrder({
            type: "repair", createdAt: plusMinutes(failed.completedAt, 10), doneOn: c.done,
            outcome: "returned_to_use", assignee: failed.assignee, reportedById: failed.assignee,
            faultReason: `Failed PPM: ${failedItem.name}`, parts: true,
          });
          completedWorkOrder({
            type: "ppm", createdAt: plusMinutes(repair.completedAt, 5), doneOn: c.done,
            outcome: "returned_to_use", assignee: failed.assignee, dueOn: c.due, scheduleId,
          });
          move(plusMinutes(failed.completedAt, 30), "ebme-workshop");
          move(plusMinutes(repair.completedAt, 60), libraryOwned ? "library" : d.homeRoom);
        } else {
          completedWorkOrder({ type: "ppm", createdAt, doneOn: c.done, outcome: "returned_to_use", dueOn: c.due, scheduleId });
        }
        lastPpmOn = c.done;
      }

      // breakdown repairs reported from the wards
      const repairFrom = maxDate(windowStart, addDays(acceptedOn, 10));
      const repairTo = addDays(historyEnd, -13);
      const expectedRepairs = spec.failuresPerYear * 1.5;
      for (let t = 0; t < 3; t++) {
        if (!rng.chance(expectedRepairs / 3) || repairFrom >= repairTo) continue;
        const day = addDays(repairFrom, rng.int(0, daysBetween(repairFrom, repairTo)));
        const createdAt = atTime(day, rng.int(7, 18), rng.int(0, 59));
        const noFault = rng.chance(0.15);
        const repair = completedWorkOrder({
          type: "repair", createdAt, doneOn: addDays(day, rng.int(1, 12)),
          outcome: noFault ? "no_fault_found" : "returned_to_use",
          reportedById: wardUser(home.dept), faultReason: rng.pick(spec.faults), parts: !noFault && rng.chance(0.7),
        });
        move(plusMinutes(createdAt, 120), "ebme-workshop");
        move(plusMinutes(repair.completedAt, 60), libraryOwned ? "library" : d.homeRoom);
      }

      // ordinary moves: library stock circulates, everything else mostly stays put
      const moveFrom = addDays(acceptedOn, 2);
      if (moveFrom < historyEnd) {
        const moves = libraryOwned ? rng.int(2, 6) : rng.int(0, 3);
        for (let m = 0; m < moves; m++) {
          const day = addDays(moveFrom, rng.int(0, daysBetween(moveFrom, historyEnd)));
          const target = libraryOwned && m % 2 === 0 ? "library" : rng.weighted(spec.placement);
          move(atTime(day, rng.int(8, 17), rng.int(0, 59)), target);
        }
      }
      const lastEventAt = () => Math.max(...events.map((e) => e.at.getTime()));

      // ---------- end state ----------
      if (d.state === "decommissioned") {
        const ber = completedWorkOrder({
          type: "repair", createdAt: atTime(berOn!, 10), doneOn: addDays(berOn!, rng.int(3, 15)),
          outcome: "beyond_economic_repair", reportedById: wardUser(home.dept),
          faultReason: rng.pick(spec.faults), failing: true,
        });
        move(new Date(Math.max(atTime(berOn!, 12).getTime(), lastEventAt() + HOUR_MS)), "ebme-workshop");
        move(plusMinutes(ber.completedAt, 60), "ebme-store");
        asset.lifecycleStatus = "decommissioned";
        asset.decommissionedAt = ber.completedAt;
      } else if (d.state === "under_repair") {
        const createdAt = atTime(openCreatedOn!, rng.int(8, 16), rng.int(0, 59));
        const awaitingParts = rng.chance(0.4);
        workOrders.push({
          id: rng.uuid(), type: "repair", status: awaitingParts ? "awaiting_parts" : "in_progress",
          priority: repairPriority(spec.category), assetId: d.id, testTemplateId: model.templateId,
          assigneeId: technician(), reportedById: wardUser(home.dept), faultReason: rng.pick(spec.faults),
          createdAt, startedAt: plusMinutes(createdAt, rng.int(60, 600)),
        });
        move(new Date(Math.max(plusMinutes(createdAt, 180).getTime(), lastEventAt() + HOUR_MS)), "ebme-workshop");
        asset.lifecycleStatus = "under_repair";
      } else if (d.state === "quarantined") {
        const failed = completedWorkOrder({
          type: "ppm", createdAt: atTime(addDays(nextDue, -14), 6), doneOn: failedOn!,
          outcome: "failed_quarantined", dueOn: nextDue, failing: true, scheduleId,
        });
        const failedItem = model.items.find((i) => i.code === failed.failCode)!;
        workOrders.push({
          id: rng.uuid(), type: "repair", status: rng.chance(0.5) ? "awaiting_parts" : "in_progress",
          priority: repairPriority(spec.category), assetId: d.id, testTemplateId: model.templateId,
          assigneeId: failed.assignee, reportedById: failed.assignee,
          faultReason: `Failed PPM: ${failedItem.name}`,
          createdAt: plusMinutes(failed.completedAt, 10), startedAt: plusMinutes(failed.completedAt, 20),
        });
        move(new Date(Math.max(plusMinutes(failed.completedAt, 30).getTime(), lastEventAt() + HOUR_MS)), "ebme-workshop");
        asset.lifecycleStatus = "quarantined";
        lastPpmOn = failedOn;
      } else {
        // normal, overdue and fault_on_ward: a final sighting where the device is now
        const finalWindowEnd = openCreatedOn ? addDays(openCreatedOn, -1) : yesterday;
        const current = libraryOwned
          ? (rng.chance(0.45) ? "library" : rng.weighted(spec.placement))
          : (rng.chance(0.8) ? d.homeRoom : rng.weighted(spec.placement));
        const candidate = atTime(addDays(finalWindowEnd, -rng.int(0, 30)), rng.int(8, 17), rng.int(0, 59));
        move(new Date(Math.max(candidate.getTime(), lastEventAt() + HOUR_MS)), current);

        if (d.state === "fault_on_ward") {
          workOrders.push({
            id: rng.uuid(), type: "repair", status: "open", priority: repairPriority(spec.category),
            assetId: d.id, testTemplateId: model.templateId, reportedById: wardUser(room(current).dept),
            faultReason: rng.pick(spec.faults), createdAt: atTime(openCreatedOn!, rng.int(8, 20), rng.int(0, 59)),
          });
        } else if (["ward", "single_room", "theatre"].includes(room(current).type)) {
          asset.inUse = rng.chance(0.4);
        }
      }

      // the daily job's open PPM job, for anything due within 14 days or overdue
      if (d.state !== "decommissioned" && needsPpmWorkOrder(nextDue, today)) {
        const afterLast = lastPpmOn ? addDays(lastPpmOn, 1) : addDays(nextDue, -14);
        workOrders.push({
          id: rng.uuid(), type: "ppm", status: "open",
          priority: ppmPriority(model.baseEm, isOverdue(nextDue, today)),
          assetId: d.id, ppmScheduleId: scheduleId, testTemplateId: model.templateId,
          assigneeId: technician(), reportedById: SYSTEM_USER_ID, dueOn: nextDue,
          createdAt: atTime(minDate(maxDate(addDays(nextDue, -14), afterLast), yesterday), 6),
        });
      }

      pushEvents(d.id, events, libraryOwned);
    });
  }

  /**
   * Location events get explicit ids so library movements can point at them; the seed then
   * moves the id sequence on. For library stock, arriving in the library is a check-in and
   * leaving it for a ward is a check-out.
   */
  function pushEvents(assetId: string, events: Event[], libraryOwned: boolean) {
    const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
    sorted.forEach((e, i) => {
      const id = data.locationEvents.length + 1;
      const target = room(e.roomKey);
      data.locationEvents.push({
        id, assetId, roomId: target.id, source: rng.chance(0.05) ? "manual" : "scan",
        scannedById: e.byUserId, occurredAt: e.at,
      });
      if (!libraryOwned) return;
      const fromLibrary = i > 0 && sorted[i - 1].roomKey === "library";
      if (target.type === "equipment_library") {
        const last = i === sorted.length - 1;
        data.libraryMovements.push({
          id: rng.uuid(), assetId, direction: "check_in", roomId: target.id, locationEventId: id,
          byUserId: libraryUser(), cleaned: true, charged: last ? rng.chance(0.85) : true, occurredAt: e.at,
        });
      } else if (fromLibrary && target.type !== "workshop") {
        data.libraryMovements.push({
          id: rng.uuid(), assetId, direction: "check_out", roomId: target.id, departmentId: deptId[target.dept],
          locationEventId: id, byUserId: libraryUser(), occurredAt: e.at,
        });
      }
    });
  }

  // number work orders in the order they were raised
  workOrders.sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  data.workOrders = workOrders.map((wo, i) => ({ ...wo, number: `WO-${String(i + 1).padStart(6, "0")}` }));

  // ---------- MDSO incidents (generated last, so adding them changed nothing above) ----------
  const INCIDENTS: [description: string, harm: "no_harm" | "low" | "moderate"][] = [
    ["Infusion delivered faster than set; noticed at the 30-minute check", "low"],
    ["Alarm did not sound when the line was occluded", "no_harm"],
    ["Device switched off during transfer; battery reading had shown full", "no_harm"],
    ["Patient bruising from a cuff that kept inflating", "low"],
    ["Bed side rail gave way when leant on; no fall", "no_harm"],
    ["Hoist lowered unexpectedly during transfer; patient unhurt", "moderate"],
    ["Display froze showing old readings", "no_harm"],
    ["Charging lead overheated at the plug", "no_harm"],
    ["Suction weak during a procedure; second unit used", "low"],
    ["Wrong date and time printed on the trace", "no_harm"],
    ["Monitor reset itself and lost alarm limits", "low"],
    ["Cracked casing found with fluid inside", "no_harm"],
  ];
  const incidentCandidates = rng.shuffle(drafts.filter((d) =>
    !d.spec.isTestEquipment && d.state === "normal" && d.purchaseDate <= addDays(windowStart, -30)));
  INCIDENTS.forEach(([description, harmLevel], i) => {
    const d = incidentCandidates[i];
    const on = addDays(windowStart, rng.int(0, daysBetween(windowStart, addDays(today, -3))));
    const occurredAt = atTime(on, rng.int(7, 20), rng.int(0, 59));
    const recent = on > addDays(today, -30);
    const reported = harmLevel !== "no_harm" && rng.chance(0.6);
    data.incidents.push({
      id: rng.uuid(), assetId: d.id, roomId: room(d.homeRoom).id, occurredAt, description, harmLevel,
      status: recent ? "open" : "closed", reportedById: wardUser(room(d.homeRoom).dept),
      reportedToMhra: reported,
      yellowCardRef: reported ? `YC-${String(rng.int(100_000, 999_999))}` : null, // fictional
      reportedToMhraAt: reported ? atTime(addDays(on, rng.int(1, 5)), 10) : null,
    });
  });
  data.incidents.sort((a, b) => a.occurredAt!.getTime() - b.occurredAt!.getTime());

  return data;
}

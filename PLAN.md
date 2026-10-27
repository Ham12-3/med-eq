# MedAsset: build plan

Phase 0 output. Source brief: *Medical Equipment Asset Tracker: Research and Claude Code Prompts* (27 Oct 2026).
Rules here follow MHRA *Managing Medical Devices* (Jan 2021), GS1 / Scan4Safety identifiers and BS EN 62353 testing.
Items marked **[Q1]**–**[Q5]** are domain decisions, recorded in section 7.

The app does four jobs: **find** a device, **fix** a device, **prove** it was maintained, and **act fast** on a safety alert.
Everything else is a report built on those four.

---

## 1. Roles and their top 5 tasks

| Role | Home screen | Top 5 tasks |
|---|---|---|
| **Technician** (biomedical engineer) | `/work` | 1. Work the job queue (priority, then due date). 2. Scan a device to open its record or job. 3. Complete the PPM checklist: inspection, parts, calibration, tests. 4. Close the job and print the SERVICED label. 5. Accept a new device into service (acceptance job). |
| **Engineering manager** | `/dashboard` | 1. See overdue PPM and compliance % at a glance. 2. Review failed tests from the last 90 days. 3. Run a recall search and track a notice to closure. 4. Balance technician workload and reassign jobs. 5. Export reports (CSV/PDF) and review EM risk scores. |
| **Ward nurse** | `/ward` (big buttons) | 1. Report a fault in two taps. 2. Find the nearest working device of a type. 3. Scan a device and check whether it is safe to use. 4. See which devices are on my ward. 5. Mark a device as in use or free **[Q4]**. |
| **Equipment library** | `/library` | 1. Check a device out to a ward. 2. Check a device in, marked as cleaned and charged. 3. See ready stock by model. 4. Chase devices that are out and overdue for return. 5. Send a faulty return to the workshop (raises a repair job). |
| **MDSO / admin** | `/notices` | 1. Log an incident and flag a Yellow Card report to the MHRA. 2. Log a safety notice and track every matched asset to closure. 3. Export audit evidence for an asset, date range or notice. 4. Manage users and roles. 5. Manage reference data: device models, rooms and test templates. |

The manager can also do everything the technician can. Admin can see everything.

---

## 2. Database schema (Drizzle)

This was the planned `db/schema.ts`. Since M1, the real [db/schema.ts](db/schema.ts) is the source of truth; the only difference is that it names every timestamp column explicitly. Conventions:

- Primary keys are UUIDs. The high-volume tables (`location_events`, `audit_log`) use `bigserial`.
- Timestamps are `timestamptz`. Due dates are `date`, read in Europe/London.
- Money is stored as integer pence.

These tables go beyond the brief's list, each because a feature needs it:

| Added table | Why it is needed |
|---|---|
| `departments` | Asset owner and report grouping |
| `test_template_items` | One row per test in a template |
| `safety_notice_criteria` | A notice can hit several models or serial ranges |
| `library_movements` | Check-in/out with cleaned and charged flags |
| `em_score_history` | Dated history of EM scores, kept nightly |

```ts
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, smallint, integer, bigint, bigserial, boolean,
  date, timestamp, numeric, jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ---------- enums ----------
export const userRole = pgEnum("user_role", ["technician", "manager", "ward", "library", "admin"]);
export const roomType = pgEnum("room_type", ["ward", "single_room", "store_room", "equipment_library", "workshop", "theatre", "other"]);
export const corridorSide = pgEnum("corridor_side", ["north", "south"]);
export const deviceCategory = pgEnum("device_category", ["life_support", "resuscitation", "infusion", "monitoring", "diagnostic", "therapy", "patient_handling", "test_equipment"]);
export const acquisitionType = pgEnum("acquisition_type", ["purchased", "leased", "manufacturer_loan", "donated"]);
export const lifecycleStatus = pgEnum("lifecycle_status", ["acceptance", "in_service", "under_repair", "quarantined", "decommissioned"]);
export const locationSource = pgEnum("location_source", ["scan", "manual", "rfid", "ble"]);
export const libraryDirection = pgEnum("library_direction", ["check_out", "check_in"]);
export const workOrderType = pgEnum("work_order_type", ["ppm", "repair", "acceptance", "recall"]);
export const workOrderStatus = pgEnum("work_order_status", ["open", "in_progress", "awaiting_parts", "completed", "cancelled"]);
export const workOrderPriority = pgEnum("work_order_priority", ["critical", "high", "normal", "low"]);
export const workOrderOutcome = pgEnum("work_order_outcome", ["returned_to_use", "failed_quarantined", "no_fault_found", "beyond_economic_repair", "actioned"]);
export const testGroup = pgEnum("test_group", ["inspection", "calibration", "electrical_safety", "performance"]);
export const testItemKind = pgEnum("test_item_kind", ["measurement", "check"]);
export const testPhase = pgEnum("test_phase", ["before", "after"]);
export const testOutcome = pgEnum("test_outcome", ["pass", "fail", "not_applicable"]);
export const noticeSource = pgEnum("notice_source", ["natpsa", "mhra_dsi", "fsn"]);
export const noticeStatus = pgEnum("notice_status", ["open", "closed"]);
export const matchStatus = pgEnum("match_status", ["open", "actioned", "not_affected"]);
export const harmLevel = pgEnum("harm_level", ["no_harm", "low", "moderate", "severe", "death"]);
export const incidentStatus = pgEnum("incident_status", ["open", "under_investigation", "closed"]);
export const auditAction = pgEnum("audit_action", ["insert", "update"]);

// ---------- people and places ----------
export const departments = pgTable("departments", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  role: userRole("role").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("users_role_idx").on(t.role)]);

export const sites = pgTable("sites", {
  id: id(),
  gln: text("gln").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
}, (t) => [check("sites_gln_ck", sql`${t.gln} ~ '^[0-9]{13}$'`)]);

export const buildings = pgTable("buildings", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("buildings_site_code_uq").on(t.siteId, t.code)]);

export const floors = pgTable("floors", {
  id: id(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id),
  level: smallint("level").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("floors_building_level_uq").on(t.buildingId, t.level)]);

export const rooms = pgTable("rooms", {
  id: id(),
  floorId: uuid("floor_id").notNull().references(() => floors.id),
  departmentId: uuid("department_id").references(() => departments.id),
  gln: text("gln").notNull().unique(),
  meshId: text("mesh_id").notNull().unique(),          // always room_<GLN>
  name: text("name").notNull(),
  roomType: roomType("room_type").notNull(),
  corridorPosition: smallint("corridor_position").notNull(), // order along the corridor; drives "distance in rooms" and the Blender layout
  corridorSide: corridorSide("corridor_side").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [
  index("rooms_floor_idx").on(t.floorId),
  uniqueIndex("rooms_floor_slot_uq").on(t.floorId, t.corridorPosition, t.corridorSide),
  check("rooms_gln_ck", sql`${t.gln} ~ '^[0-9]{13}$'`),
  check("rooms_mesh_id_ck", sql`${t.meshId} = 'room_' || ${t.gln}`),
]);

// ---------- device types, templates, risk ----------
export const testTemplates = pgTable("test_templates", {
  id: id(),
  code: text("code").notNull(),
  version: smallint("version").notNull().default(1),  // templates are versioned, never edited in place
  name: text("name").notNull(),
  standard: text("standard"),                          // e.g. "BS EN 62353"
  createdAt: createdAt(),
}, (t) => [uniqueIndex("test_templates_code_version_uq").on(t.code, t.version)]);

export const testTemplateItems = pgTable("test_template_items", {
  id: id(),
  templateId: uuid("template_id").notNull().references(() => testTemplates.id),
  position: smallint("position").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  group: testGroup("group").notNull(),
  kind: testItemKind("kind").notNull(),
  unit: text("unit"),
  lowerLimit: numeric("lower_limit"),
  upperLimit: numeric("upper_limit"),
  required: boolean("required").notNull().default(true),
  requiresAnalyser: boolean("requires_analyser").notNull().default(false),
}, (t) => [
  uniqueIndex("tti_template_code_uq").on(t.templateId, t.code),
  index("tti_template_idx").on(t.templateId),
  check("tti_limits_ck", sql`${t.kind} = 'check' or ${t.lowerLimit} is not null or ${t.upperLimit} is not null`),
]);

export const deviceModels = pgTable("device_models", {
  id: id(),
  slug: text("slug").notNull().unique(),               // matches model_<slug> in the 3D files
  name: text("name").notNull(),                        // generic only
  manufacturer: text("manufacturer").notNull(),        // fictional only
  category: deviceCategory("category").notNull(),
  ppmIntervalMonths: smallint("ppm_interval_months").notNull(),
  ppmIntervalReason: text("ppm_interval_reason"),      // e.g. "LOLER: 6-monthly thorough examination"
  testTemplateId: uuid("test_template_id").notNull().references(() => testTemplates.id),
  emFunction: smallint("em_function").notNull(),
  emPhysicalRisk: smallint("em_physical_risk").notNull(),
  emMaintenance: smallint("em_maintenance").notNull(),
  widthCm: smallint("width_cm"),
  depthCm: smallint("depth_cm"),
  heightCm: smallint("height_cm"),
  isTestEquipment: boolean("is_test_equipment").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("device_models_category_idx").on(t.category),
  check("dm_interval_ck", sql`${t.ppmIntervalMonths} between 1 and 24`),
  check("dm_em_function_ck", sql`${t.emFunction} between 2 and 10`),
  check("dm_em_risk_ck", sql`${t.emPhysicalRisk} between 1 and 5`),
  check("dm_em_maint_ck", sql`${t.emMaintenance} between 1 and 5`),
]);

export const emScoreHistory = pgTable("em_score_history", {
  id: id(),
  deviceModelId: uuid("device_model_id").notNull().references(() => deviceModels.id),
  function: smallint("function").notNull(),
  physicalRisk: smallint("physical_risk").notNull(),
  maintenance: smallint("maintenance").notNull(),
  incidentHistory: smallint("incident_history").notNull(),
  total: smallint("total").notNull(),
  failuresPerAssetYear: numeric("failures_per_asset_year").notNull(),
  calculatedAt: createdAt(),
}, (t) => [
  index("emh_model_time_idx").on(t.deviceModelId, t.calculatedAt.desc()),
  check("emh_history_ck", sql`${t.incidentHistory} between -2 and 2`),
]);

// ---------- the asset register ----------
export const assets = pgTable("assets", {
  id: id(),
  giai: text("giai").notNull().unique(),
  serialNumber: text("serial_number").notNull(),
  deviceModelId: uuid("device_model_id").notNull().references(() => deviceModels.id),
  ownerDepartmentId: uuid("owner_department_id").notNull().references(() => departments.id),
  lifecycleStatus: lifecycleStatus("lifecycle_status").notNull().default("acceptance"),
  inUse: boolean("in_use").notNull().default(false),   // [Q4]
  acquisitionType: acquisitionType("acquisition_type").notNull().default("purchased"),
  purchaseDate: date("purchase_date"),
  purchasePricePence: integer("purchase_price_pence"),
  endOfLifeDate: date("end_of_life_date"),
  firmwareVersion: text("firmware_version"),
  acceptedAt: ts("accepted_at"),
  decommissionedAt: ts("decommissioned_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("assets_model_serial_uq").on(t.deviceModelId, t.serialNumber),
  index("assets_model_idx").on(t.deviceModelId),
  index("assets_dept_idx").on(t.ownerDepartmentId),
  index("assets_lifecycle_idx").on(t.lifecycleStatus),
  index("assets_eol_idx").on(t.endOfLifeDate),
  check("assets_giai_ck", sql`char_length(${t.giai}) between 8 and 30`),
]);

export const locationEvents = pgTable("location_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  roomId: uuid("room_id").notNull().references(() => rooms.id),
  source: locationSource("source").notNull(),
  scannedById: uuid("scanned_by_id").references(() => users.id),
  occurredAt: ts("occurred_at").notNull(),
  recordedAt: createdAt(),
}, (t) => [
  index("le_asset_time_idx").on(t.assetId, t.occurredAt.desc(), t.id.desc()), // powers "current location"
  index("le_room_time_idx").on(t.roomId, t.occurredAt.desc()),
  check("le_scanner_ck", sql`${t.source} not in ('scan', 'manual') or ${t.scannedById} is not null`),
]);

export const libraryMovements = pgTable("library_movements", {
  id: id(),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  direction: libraryDirection("direction").notNull(),
  roomId: uuid("room_id").notNull().references(() => rooms.id),           // destination
  departmentId: uuid("department_id").references(() => departments.id),  // borrowing ward on check-out
  locationEventId: bigint("location_event_id", { mode: "number" }).notNull().references(() => locationEvents.id),
  byUserId: uuid("by_user_id").notNull().references(() => users.id),
  cleaned: boolean("cleaned"),
  charged: boolean("charged"),
  occurredAt: createdAt(),
}, (t) => [index("lm_asset_time_idx").on(t.assetId, t.occurredAt.desc())]);

export const ppmSchedules = pgTable("ppm_schedules", {
  id: id(),
  assetId: uuid("asset_id").notNull().unique().references(() => assets.id),
  intervalMonths: smallint("interval_months").notNull(),
  lastDoneOn: date("last_done_on"),
  nextDueOn: date("next_due_on").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("ppm_next_due_idx").on(t.nextDueOn).where(sql`${t.active}`)]);

// ---------- safety notices ----------
export const safetyNotices = pgTable("safety_notices", {
  id: id(),
  reference: text("reference").notNull().unique(),     // e.g. NatPSA/2026/004/MHRA
  source: noticeSource("source").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requiredAction: text("required_action").notNull(),
  issuedOn: date("issued_on").notNull(),
  deadline: date("deadline").notNull(),
  quarantineRequired: boolean("quarantine_required").notNull().default(true), // [Q2]
  status: noticeStatus("status").notNull().default("open"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  closedAt: ts("closed_at"),
}, (t) => [index("sn_status_deadline_idx").on(t.status, t.deadline)]);

export const safetyNoticeCriteria = pgTable("safety_notice_criteria", {
  id: id(),
  noticeId: uuid("notice_id").notNull().references(() => safetyNotices.id),
  deviceModelId: uuid("device_model_id").notNull().references(() => deviceModels.id),
  serialFrom: text("serial_from"),                     // inclusive; null = no lower bound
  serialTo: text("serial_to"),                         // inclusive; null = no upper bound
  firmwareVersions: text("firmware_versions").array(), // null = any firmware
}, (t) => [
  index("snc_notice_idx").on(t.noticeId),
  index("snc_model_idx").on(t.deviceModelId),
]);

export const safetyNoticeMatches = pgTable("safety_notice_matches", {
  id: id(),
  noticeId: uuid("notice_id").notNull().references(() => safetyNotices.id),
  criteriaId: uuid("criteria_id").notNull().references(() => safetyNoticeCriteria.id),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  status: matchStatus("status").notNull().default("open"),
  roomIdAtMatch: uuid("room_id_at_match").references(() => rooms.id), // snapshot for the recall list
  matchedAt: createdAt(),
  actionedAt: ts("actioned_at"),
  actionedById: uuid("actioned_by_id").references(() => users.id),
}, (t) => [
  uniqueIndex("snm_notice_asset_uq").on(t.noticeId, t.assetId),
  index("snm_asset_status_idx").on(t.assetId, t.status),
]);

// ---------- work ----------
export const workOrders = pgTable("work_orders", {
  id: id(),
  number: text("number").notNull().unique(),           // WO-000123
  type: workOrderType("type").notNull(),
  status: workOrderStatus("status").notNull().default("open"),
  priority: workOrderPriority("priority").notNull().default("normal"),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  ppmScheduleId: uuid("ppm_schedule_id").references(() => ppmSchedules.id),
  safetyNoticeMatchId: uuid("safety_notice_match_id").references(() => safetyNoticeMatches.id),
  testTemplateId: uuid("test_template_id").references(() => testTemplates.id), // template version fixed at creation
  assigneeId: uuid("assignee_id").references(() => users.id),
  reportedById: uuid("reported_by_id").notNull().references(() => users.id),
  faultReason: text("fault_reason"),
  faultPhotoPath: text("fault_photo_path"),
  inspection: jsonb("inspection").$type<{ clean: boolean; decontaminated: boolean; controlSettings: string; notes?: string }>(),
  calibrationNotes: text("calibration_notes"),
  outcome: workOrderOutcome("outcome"),
  dueOn: date("due_on"),
  createdAt: createdAt(),
  startedAt: ts("started_at"),
  completedAt: ts("completed_at"),
  closedById: uuid("closed_by_id").references(() => users.id),
}, (t) => [
  index("wo_assignee_status_idx").on(t.assigneeId, t.status),
  index("wo_queue_idx").on(t.status, t.priority, t.dueOn),
  index("wo_asset_time_idx").on(t.assetId, t.createdAt.desc()),
  uniqueIndex("wo_one_open_ppm_uq").on(t.ppmScheduleId)
    .where(sql`${t.status} in ('open', 'in_progress', 'awaiting_parts')`),
  check("wo_ppm_ck", sql`${t.type} <> 'ppm' or ${t.ppmScheduleId} is not null`),
  check("wo_recall_ck", sql`${t.type} <> 'recall' or ${t.safetyNoticeMatchId} is not null`),
  check("wo_completed_ck", sql`${t.status} <> 'completed' or (${t.completedAt} is not null and ${t.outcome} is not null)`),
]);

export const testResults = pgTable("test_results", {
  id: id(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
  templateItemId: uuid("template_item_id").notNull().references(() => testTemplateItems.id),
  phase: testPhase("phase").notNull().default("after"),
  measuredValue: numeric("measured_value"),
  unit: text("unit"),                                  // copied from the template item at test time
  lowerLimit: numeric("lower_limit"),
  upperLimit: numeric("upper_limit"),
  outcome: testOutcome("outcome").notNull(),           // computed server-side for measurements
  analyserAssetId: uuid("analyser_asset_id").references(() => assets.id),
  recordedById: uuid("recorded_by_id").notNull().references(() => users.id),
  recordedAt: createdAt(),
  notes: text("notes"),
}, (t) => [
  uniqueIndex("tr_wo_item_phase_uq").on(t.workOrderId, t.templateItemId, t.phase),
  index("tr_wo_idx").on(t.workOrderId),
  index("tr_outcome_time_idx").on(t.outcome, t.recordedAt.desc()),
  index("tr_analyser_idx").on(t.analyserAssetId),
]);

export const partsUsed = pgTable("parts_used", {
  id: id(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
  partNumber: text("part_number").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier").notNull(),
  lotNumber: text("lot_number"),
  quantity: smallint("quantity").notNull().default(1),
  recordedById: uuid("recorded_by_id").notNull().references(() => users.id),
  recordedAt: createdAt(),
}, (t) => [
  index("pu_wo_idx").on(t.workOrderId),
  index("pu_lot_idx").on(t.lotNumber),
  index("pu_part_idx").on(t.partNumber),
]);

// ---------- MDSO ----------
export const incidents = pgTable("incidents", {
  id: id(),
  reference: text("reference").notNull().unique(),
  assetId: uuid("asset_id").references(() => assets.id),
  roomId: uuid("room_id").references(() => rooms.id),
  occurredAt: ts("occurred_at").notNull(),
  description: text("description").notNull(),
  harmLevel: harmLevel("harm_level").notNull(),
  status: incidentStatus("status").notNull().default("open"),
  reportedById: uuid("reported_by_id").notNull().references(() => users.id),
  reportedToMhra: boolean("reported_to_mhra").notNull().default(false),
  yellowCardRef: text("yellow_card_ref"),
  reportedToMhraAt: ts("reported_to_mhra_at"),
  createdAt: createdAt(),
}, (t) => [
  index("inc_asset_idx").on(t.assetId),
  index("inc_status_time_idx").on(t.status, t.occurredAt.desc()),
  check("inc_mhra_ck", sql`not ${t.reportedToMhra} or (${t.yellowCardRef} is not null and ${t.reportedToMhraAt} is not null)`),
]);

// ---------- audit ----------
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  action: auditAction("action").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value").notNull(),
  userId: uuid("user_id").references(() => users.id),
  occurredAt: createdAt(),
}, (t) => [
  index("al_record_idx").on(t.tableName, t.recordId, t.occurredAt),
  index("al_user_time_idx").on(t.userId, t.occurredAt),
  index("al_time_idx").on(t.occurredAt),
]);
```

### Database-level guarantees (hand-written SQL in the first migration)

- **Audit trigger.** A generic `audit_row()` AFTER INSERT OR UPDATE trigger sits on every domain table. It writes the old and new values as `to_jsonb(OLD)` and `to_jsonb(NEW)`.
  - The user comes from `current_setting('app.user_id')`.
  - If that setting is missing, the trigger **raises**, so no write can skip attribution.
  - The app sets it inside every transaction through one data-layer helper, `withUser(userId, tx => …)`. The seed uses a `system` user.
- **No deletes, ever.** A `forbid_delete()` BEFORE DELETE trigger, and a BEFORE TRUNCATE trigger, sit on every domain table. Retiring something means changing a status: `decommissioned`, `cancelled`, `active = false`.
- **Updates.** These are allowed, because every update is captured with its old value. That is how "changes never hide what was there before" is met.
- **audit_log is append-only.** UPDATE and DELETE triggers on it raise. The app's database role is also only granted `INSERT, SELECT` on it. Only migrations run as the owner role.
- **Current location view.** It uses a lateral join, so each asset costs one index probe on `le_asset_time_idx`. That stays fast at 50k assets and millions of events, where a plain `DISTINCT ON` would scan the whole table.
  ```sql
  create view asset_current_location as
  select a.id as asset_id, l.room_id, l.source, l.occurred_at
  from assets a
  cross join lateral (
    select room_id, source, occurred_at from location_events e
    where e.asset_id = a.id order by e.occurred_at desc, e.id desc limit 1
  ) l;
  ```
  If it is still too slow, the fallback is a `current_room_id` column on `assets`, kept up to date by a trigger on `location_events`. A benchmark script seeds 50k assets with 20 events each to decide.
- **Status facts view.** `asset_status_facts` gathers, per asset: lifecycle status, `in_use`, `next_due_on`, whether the latest completed test failed, the count of open notice matches, and whether a repair job is open. The status function in section 3 runs on these facts.

### Identifiers (GS1 / Scan4Safety)

- **Prefix.** All codes use the fictional company prefix `0299999`. It sits in GS1's 02x restricted-circulation range, so it can never collide with a real allocated number.
- **GLN** (rooms, site): prefix + 5-digit location reference + mod-10 check digit, 13 digits in total. Barcodes use AI `(414)`.
- **GIAI** (assets): prefix + model code + sequence, for example `0299999IVP000123`. Barcodes use AI `(8004)`, as a GS1 DataMatrix on the device.
- **Scanner.** It parses GS1 element strings (both AIs) and also accepts a raw typed code.

---

## 3. Status rules

All of these live as pure functions in `lib/rules/`. Each rule has Vitest tests, run against a frozen "today" (Europe/London).

### 3.1 PPM due and overdue (`lib/rules/ppm.ts`)

- **Overdue:** the schedule is active and `today > next_due_on`. Due *on* the day is still in date.
- **Due soon:** `next_due_on − 14 days ≤ today ≤ next_due_on`. This is the same window the daily job uses to create PPM jobs.
- **Next due date:** when a PPM job closes with every required test passed, `last_done_on` becomes the completion date. `next_due_on` becomes the completion date + `interval_months`, counted from **completion, not the old due date**. Doing a late PPM therefore never leaves the device "instantly overdue again" **[Q5]**.
- **Acceptance:** passing acceptance creates the schedule, with `next_due_on` = acceptance date + interval.
- **Interval reasons:** the model's `ppm_interval_reason` records why an interval exists, for example LOLER's 6-monthly thorough examination for patient hoists. A legal interval stays even when the EM score is low.

### 3.2 "Do not use" (`lib/rules/assetStatus.ts`)

An asset is **Do not use** if *any* of these is true. Each one adds a reason code, so the screen can say why.

| # | Condition | Reason code |
|---|---|---|
| 1 | `lifecycle_status` is `acceptance`, `under_repair`, `quarantined` or `decommissioned` | `NOT_IN_SERVICE` |
| 2 | PPM overdue (3.1) | `PPM_OVERDUE` |
| 3 | The most recent completed job with test results has a required item that failed in the `after` phase. A later job that passes clears this. | `FAILED_TEST` |
| 4 | An open `safety_notice_matches` row exists whose notice has `quarantine_required` **[Q2]** | `SAFETY_NOTICE` |
| 5 | An open repair job exists (ward fault report not yet resolved) | `FAULT_REPORTED` |

**Display status** is used by the map, badges and filters. When several apply, the first in this list wins:
`recalled` (rule 4) → `do_not_use` (rules 1–3, 5) → `due_soon` → `in_use` → `available`.

**Also flagged, but not Do not use:** the device is past its `end_of_life_date`. It shows in reports for the manager to decide.

**Two implementations, one check.** `deriveAssetStatus(facts)` in TypeScript is the reference version. The `asset_status_facts` view also computes `do_not_use` in SQL, so the 400-row table can be filtered fast. A **parity test** runs both on every seeded asset and fails if they ever disagree.

### 3.3 When a work order may close (`lib/rules/workOrder.ts`)

`canClose(workOrder)` returns a list of blocking reasons. Close is allowed only when the list is empty.

1. **Every required test has a result.** Each `required` item in the job's template version has an `after`-phase result of `pass` or `fail`. `not_applicable` is allowed only on optional items.
2. **Measurement outcomes come from limits.** For measurements the server compares the value with the limits and sets the outcome. The technician cannot pick it.
3. **Analyser recorded and usable.** Every result on an item marked `requiresAnalyser` has an `analyser_asset_id`. That analyser must not itself be Do not use (for example out of calibration).
4. **Inspection done.** The inspection section (clean, decontaminated, control settings noted) is complete for `ppm`, `acceptance` and `repair` jobs.
5. **Repairs end with a safety test.** A `repair` job needs a passing electrical safety group before it can close as `returned_to_use`, as BS EN 62353 requires for tests after repair. The exception is the `no_fault_found` outcome, which a technician can choose after inspection.
6. **Recalls need the action recorded.** Closing a `recall` job marks its notice match `actioned`. When every match on a notice is `actioned` or `not_affected`, the notice can be closed.

**What happens on close** **[Q3]**:

- **All required tests pass:** the asset goes to `in_service`. The PPM schedule moves forward. The SERVICED label PDF is offered.
- **Any required test fails:** the job still closes with outcome `failed_quarantined`. The asset goes to `quarantined`, so it shows as Do not use. A follow-up `repair` job is created automatically. The PPM schedule does **not** move forward.

### 3.4 Job priority (daily job)

| Situation | Priority |
|---|---|
| Ward fault report, or a recall where the notice requires quarantine | `high` |
| Life-support category with a fault | `critical` |
| PPM on a model with EM ≥ 16 | `high` |
| PPM on a model with EM 12–15 | `normal` |
| PPM on a model with EM < 12 | `low` |
| Overdue PPM | Raised one level |

---

## 4. EM score (Fennigkoh and Smith) — `lib/rules/emScore.ts`

`EM = Function (2–10) + Physical risk (1–5) + Maintenance need (1–5) + Incident history (−2 to +2)`. The total ranges from 2 to 22.

**EM ≥ 12 means the model belongs on scheduled PPM.** A model scoring below 12 is flagged as a candidate for inspection-only or run-to-failure. Its schedules are *not* removed automatically, and legal intervals always stay.

**Incident history** is worked out nightly from the last 24 months:

1. Count failures: repair jobs that did not close as `no_fault_found`, plus incidents linked to assets of that model.
2. Divide by (assets of that model × 2 years) to get failures per asset-year.
3. Convert that to the average time between failures, then score it:

| Average time between failures | Score |
|---|---|
| Under 6 months | +2 |
| 6–9 months | +1 |
| 9–18 months | 0 |
| 18–30 months | −1 |
| Over 30 months, or no failures | −2 |

Every nightly run writes a dated row to `em_score_history`.

**Score scales** (reference; the UI shows these as picklists):

- **Function:**
  - 10: life support
  - 9: surgical and intensive care
  - 8: therapy and treatment
  - 7: surgical and intensive care monitoring
  - 6: other physiological monitoring and diagnostics
  - 5: analytical laboratory
  - 4: laboratory accessories
  - 3: computers and related
  - 2: patient-related and other
- **Physical risk:**
  - 5: death
  - 4: patient or operator injury
  - 3: inappropriate therapy or misdiagnosis
  - 2: equipment damage
  - 1: no significant risk
- **Maintenance need:**
  - 5: extensive
  - 4: above average
  - 3: average
  - 2: below average
  - 1: minimal

### Seed device models (all generic, all synthetic)

| Slug | F | R | M | Base (before history) | PPM interval | Seed count |
|---|---|---|---|---|---|---|
| `ventilator` | 10 | 5 | 5 | 20 | 6 mo | 18 |
| `defibrillator` | 10 | 5 | 4 | 19 | 12 mo | 20 |
| `volumetric-infusion-pump` | 9 | 5 | 4 | 18 | 12 mo | 90 |
| `syringe-driver` | 9 | 5 | 3 | 17 | 12 mo | 60 |
| `suction-unit` | 8 | 4 | 3 | 15 | 12 mo | 25 |
| `patient-monitor` | 7 | 3 | 3 | 13 | 12 mo | 60 |
| `ecg-machine` | 6 | 3 | 3 | 12 | 12 mo | 15 |
| `spot-check-vital-signs-monitor` | 6 | 3 | 2 | 11 | 12 mo | 40 |
| `patient-hoist` | 2 | 4 | 4 | 10 | 6 mo (LOLER) | 12 |
| `hospital-bed` | 2 | 4 | 3 | 9 | 12 mo | 60 |

The table totals **400 clinical assets**. The seed also adds 3 `electrical-safety-analyser` assets (category `test_equipment`), so technicians have analysers to record on test results.

Beds and hoists score under 12 but keep their schedules. Hoists keep theirs because of LOLER; electric beds keep theirs because the manufacturer requires it. The app shows this conflict on purpose, because it is a real one.

### Seed test templates

The limits are typical BS EN 62353 values for synthetic data only. Check them against the current standard before any real use.

- **`ES-62353-CLASS-I` (electrical safety, Class I):**
  - Visual inspection (check)
  - Protective earth resistance ≤ 0.3 Ω
  - Equipment leakage, direct or differential ≤ 500 µA
  - Applied part leakage: type BF ≤ 5000 µA, or type CF ≤ 50 µA, depending on the template variant
- **Functional templates, per model.** Each includes the electrical safety items plus its own checks:
  - Infusion pump: flow-rate accuracy ±5 %, occlusion alarm, air-in-line alarm
  - Defibrillator: delivered energy at 200 J ±15 %, charge time under 10 s
  - Patient monitor: NIBP accuracy ±3 mmHg, SpO2 simulator reading, alarm check
  - Every other model gets a fitting short list

---

## 5. Pages and route map

| Route | Who | What |
|---|---|---|
| `/` | all | Redirects to the role's home screen |
| `/login` | all | Sign in. In dev, there is a "sign in as" picker for the seeded users **[Q1]** |
| `/dashboard` | manager | 6 headline numbers, each linking to its list (below) |
| `/assets` | tech, manager, admin | TanStack Table: search; filters for status, model, department, overdue and location; saved views |
| `/assets/new` | tech | Register a device and open its acceptance job |
| `/assets/[id]` | all (ward: read-only summary) | Status badge with reasons, current room, location history, PPM schedule, jobs, tests, parts, audit trail |
| `/scan` | all | Camera scan (ZXing): device GIAI, then room GLN, then confirm, which writes a location event. Manual entry fallback |
| `/find` | ward, library | Nearest available device: room + model in, ranked list out |
| `/ward` | ward | Three big buttons: report a fault, find a device, check a device |
| `/report-fault` | ward | Two taps: pick device (scan or search), pick a reason. Optional photo |
| `/work` | tech | My job queue, sorted by priority then due date. Manager can switch technicians |
| `/work/[id]` | tech | The MHRA checklist in order: inspection, parts, calibration, tests (from the template), return to use |
| `/work/[id]/label.pdf` | tech | SERVICED label: GIAI, date, technician initials, next due date |
| `/library` | library | Check out and in, ready stock by model, overdue loans |
| `/models`, `/models/[id]` | manager, admin | Device models, EM calculator and score history, test template |
| `/notices`, `/notices/new`, `/notices/[id]` | admin, manager | Log a notice, see matched assets with last known room, track to closure |
| `/incidents`, `/incidents/new`, `/incidents/[id]` | admin | MDSO incident log with the Yellow Card flag |
| `/reports`, `/reports/[slug]` | manager | Compliance, overdue, failed tests, MTTR, end-of-life, open notices. `?format=csv\|pdf` |
| `/map` | all | 3D floor view with markers coloured by display status |
| `/admin/users` | admin | Users and roles |
| `/admin/audit` | admin | Search the audit log and export evidence (CSV/PDF) |
| `/api/cron/daily` | scheduler | Creates PPM jobs, refreshes overdue flags, recalculates EM. Protected by `CRON_SECRET` |

### Dashboard: the 6 numbers

1. PPM compliance: % of active schedules in date today
2. Overdue PPM count
3. Do-not-use asset count
4. Failed tests in the last 90 days
5. Open safety notices, with matched assets not yet actioned
6. Mean time to repair: average of `completed_at − created_at` over repair jobs closed in the last 90 days

### Nearest available (`/find`)

Candidates are assets of the chosen model that are **available**: in service, in date, not Do not use and not in use.

They are ranked by:

1. Same floor first.
2. Then `|corridor_position difference|` within the floor. This is the "distance in rooms".
3. Then other floors in the same building, by floor distance.
4. Then other buildings.

Equipment-library rooms win a tie, because their stock is known to be clean and charged.

---

## 6. Build order (milestones)

Each step is small, ends with green tests, and gets a check before moving on. The brief's Phases 1–4 map to M1–M4, and Phase 8 to M5. The art track (Phases 5–7 and 9) starts only after M4, as the brief's risk table advises.

### M1: Foundation (Phase 1)

1. **Scaffold.** Next.js App Router, TS strict, Tailwind, shadcn/ui, Vitest, Playwright, pnpm.
   - Postgres 16 runs in `docker-compose.yml`.
   - `.env.example` lists the environment variables.
   - Scripts: `pnpm db:up`, `db:migrate`, `db:seed`, `db:reset`.
2. **Schema and first migration.** Drizzle schema plus the hand-written SQL: triggers, views and grants.
3. **Audit and no-delete guarantees.** Tests prove that:
   - every insert and update writes an audit row with a user;
   - a write without `app.user_id` fails;
   - DELETE and TRUNCATE fail on domain tables;
   - UPDATE and DELETE on `audit_log` fail.
4. **Seed.** It is deterministic, using a fixed random seed and a `--today` option. It creates:
   - 1 site, 2 buildings, 3 floors and 40 rooms, including a workshop and an equipment library;
   - 7 departments;
   - the 10 models, the templates, 400 assets and 3 analysers;
   - users for each role;
   - 18 months of PPM history, repairs and incidents, about 8 % overdue and a handful of failed tests.

   Vitest checks the totals, and the run prints row counts per table.
5. **Auth and roles.** Sign-in **[Q1]**, role-based home redirect, and `can(user, action)` guards on every server action.

### M2: Register and locations (Phase 2)

1. **Current location.** The `asset_current_location` view, with unit tests and a 50k-asset benchmark script.
2. **Status logic.** `lib/rules/assetStatus.ts` plus the `asset_status_facts` view, with unit tests and the parity test.
3. **`/assets`.** Table, filters and saved views.
4. **`/assets/[id]`.** The full device page.
5. **`/scan`.** Camera and manual entry, with a Playwright test using a mocked camera stream.
6. **`/find`.** Nearest available, with unit tests on the ranking.

### M3: Work orders, PPM and tests (Phase 3)

1. **Close rules.** `lib/rules/workOrder.ts` (`canClose`, close side effects), with Vitest covering every rule in 3.3.
2. **`/work`.** The job queue.
3. **`/work/[id]`.** The checklist: inspection, parts, calibration, tests with analyser, return to use.
4. **Daily job.** Creates PPM jobs 14 days ahead and flags overdue ones. It is idempotent: running it twice creates nothing new.
5. **`/report-fault`.** The two-tap ward form, which creates a repair job and makes the asset Do not use.
6. **SERVICED label PDF.**
7. **`/library`.** Check out and in (writes a location event and a library movement), ready stock **[Q4]**.

### M4: Risk, notices and reports (Phase 4)

1. **EM calculator.** Nightly recalculation and score history, with tests on the incident-history scoring bands.
2. **Safety notices.** Criteria and matching (model, serial range, firmware), recall jobs, tracking to closure. Tests cover serial range edges.
3. **Incidents.** The log, with the Yellow Card flag.
4. **`/reports`.** Six reports with CSV and PDF export.
5. **`/dashboard`.** The manager's home page.
6. **`/admin/audit`.** Audit search and evidence export.

### M5: 3D map (Phase 8)

1. **Placeholder map, built in the app.** The floor plan is generated in three.js from the `rooms` table (corridor position and side give a grid), with instanced markers coloured by status, a legend, and pulse plus icon for overdue and recalled. This proves the idea before any Blender work.
2. **Real building model.** Swap in `public/models/hospital.glb` once Phase 5 exports it. Room meshes are found by `room_<GLN>`.
3. **Interaction.** Hover tooltip, click to fly the camera there, side panel with the detailed device `.glb`, filters, "Show recall" mode.
4. **Performance.** First view under 3 s and 60 fps while orbiting, measured and reported. A list-view equivalent for every map action.

### Art track (Phases 5–7, 9), after M4

| Step | Phase | Work |
|---|---|---|
| A1 | 5 | Procedural hospital in Blender from the seeded rooms (export `art/blend/rooms.json` first) |
| A2 | 6 | `scripts/gemini-images.ts`: infusion pump only, then review, then the rest |
| A3 | 7 | Image-to-3D and Blender cleanup: infusion pump first, then one model at a time |
| A4 | 9 | `scripts/gemini-video.ts`: one clip, then review, then the rest; plus a GIF of the real map |

### M6: QA as each role (Phase 10)

Run each role's top tasks in Chrome. Write `docs/qa.md` with screenshots.

### Dependencies to approve for M1

These follow the CLAUDE.md "ask first" rule. Approving this plan approves this list. Anything else gets asked about separately.

| Purpose | Packages |
|---|---|
| App framework | `next`, `react`, `react-dom`, `typescript` |
| Database | `drizzle-orm`, `drizzle-kit`, `postgres` (postgres.js driver) |
| Validation | `zod` |
| UI | `tailwindcss`, shadcn/ui (copies components in; pulls `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`), `@tanstack/react-table` |
| Auth | `next-auth` (Auth.js) **[Q1]** |
| Seed data | `@faker-js/faker` |
| Tests | `vitest`, `@playwright/test`, `tsx` (for running scripts) |
| Later milestones | `@zxing/browser` (M2), `@react-pdf/renderer` (M3), `three`, `@react-three/fiber`, `@react-three/drei` (M5), `@gltf-transform/cli` (art track) |

---

## 7. Decisions

Q1–Q4 were decided on 27 Oct 2026. Q5 is still a default and can be changed.

| # | Question | Decision |
|---|---|---|
| Q1 | Where do the database and sign-in live? | **Decided:** Postgres 16 in Docker for local dev, with Auth.js. Roles are enforced in server code through `can(user, action)`. Any hosted Postgres works later. |
| Q2 | Does every open safety notice make matched devices Do not use? | **Decided:** each notice has a `quarantine_required` flag, defaulting to true. Advisory notices can be logged and tracked without taking devices out of use. |
| Q3 | What happens when a PPM job has a failed test? | **Decided:** the job closes as `failed_quarantined`. The asset is quarantined, a repair job is created automatically, and the PPM date does not move forward. |
| Q4 | How does the app know a device is "in use"? | **Decided:** ward staff tap "In use" or "Free" after scanning. Library check-out sets in use, and check-in clears it. |
| Q5 | Is the next PPM due date counted from completion or from the original due date? | **Default:** from the completion date. |

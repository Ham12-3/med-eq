import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, pgView, uuid, text, smallint, integer, bigint, bigserial, boolean,
  date, timestamp, numeric, jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";

// Hand-written SQL in db/migrations adds what Drizzle cannot express:
// audit and no-delete triggers, updated_at triggers, grants and views.
// Every table except audit_log must have the audit and no-delete triggers
// (tests/db/guarantees.test.ts checks this).

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const stamp = (name: string) => ts(name).notNull().defaultNow();

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
  createdAt: stamp("created_at"),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  role: userRole("role").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  active: boolean("active").notNull().default(true),
  createdAt: stamp("created_at"),
}, (t) => [index("users_role_idx").on(t.role)]);

export const sites = pgTable("sites", {
  id: id(),
  gln: text("gln").notNull().unique(),
  name: text("name").notNull(),
  createdAt: stamp("created_at"),
}, (t) => [check("sites_gln_ck", sql`${t.gln} ~ '^[0-9]{13}$'`)]);

export const buildings = pgTable("buildings", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  createdAt: stamp("created_at"),
}, (t) => [uniqueIndex("buildings_site_code_uq").on(t.siteId, t.code)]);

export const floors = pgTable("floors", {
  id: id(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id),
  level: smallint("level").notNull(),
  name: text("name").notNull(),
  createdAt: stamp("created_at"),
}, (t) => [uniqueIndex("floors_building_level_uq").on(t.buildingId, t.level)]);

export const rooms = pgTable("rooms", {
  id: id(),
  floorId: uuid("floor_id").notNull().references(() => floors.id),
  departmentId: uuid("department_id").references(() => departments.id),
  gln: text("gln").notNull().unique(),
  meshId: text("mesh_id").notNull().unique(), // always room_<GLN>
  name: text("name").notNull(),
  roomType: roomType("room_type").notNull(),
  corridorPosition: smallint("corridor_position").notNull(), // order along the corridor: "distance in rooms" and the Blender layout
  corridorSide: corridorSide("corridor_side").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: stamp("created_at"),
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
  version: smallint("version").notNull().default(1), // versioned, never edited in place
  name: text("name").notNull(),
  standard: text("standard"), // e.g. "BS EN 62353"
  createdAt: stamp("created_at"),
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
  slug: text("slug").notNull().unique(), // matches model_<slug> in the 3D files
  name: text("name").notNull(), // generic only
  manufacturer: text("manufacturer").notNull(), // fictional only
  category: deviceCategory("category").notNull(),
  ppmIntervalMonths: smallint("ppm_interval_months").notNull(),
  ppmIntervalReason: text("ppm_interval_reason"), // e.g. "LOLER: 6-monthly thorough examination"
  testTemplateId: uuid("test_template_id").notNull().references(() => testTemplates.id),
  emFunction: smallint("em_function").notNull(),
  emPhysicalRisk: smallint("em_physical_risk").notNull(),
  emMaintenance: smallint("em_maintenance").notNull(),
  widthCm: smallint("width_cm"),
  depthCm: smallint("depth_cm"),
  heightCm: smallint("height_cm"),
  isTestEquipment: boolean("is_test_equipment").notNull().default(false),
  createdAt: stamp("created_at"),
  updatedAt: stamp("updated_at"),
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
  calculatedAt: stamp("calculated_at"),
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
  inUse: boolean("in_use").notNull().default(false),
  acquisitionType: acquisitionType("acquisition_type").notNull().default("purchased"),
  purchaseDate: date("purchase_date"),
  purchasePricePence: integer("purchase_price_pence"),
  endOfLifeDate: date("end_of_life_date"),
  firmwareVersion: text("firmware_version"),
  acceptedAt: ts("accepted_at"),
  decommissionedAt: ts("decommissioned_at"),
  createdAt: stamp("created_at"),
  updatedAt: stamp("updated_at"),
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
  recordedAt: stamp("recorded_at"),
}, (t) => [
  index("le_asset_time_idx").on(t.assetId, t.occurredAt.desc(), t.id.desc()), // powers current location
  index("le_room_time_idx").on(t.roomId, t.occurredAt.desc()),
  check("le_scanner_ck", sql`${t.source} not in ('scan', 'manual') or ${t.scannedById} is not null`),
]);

export const libraryMovements = pgTable("library_movements", {
  id: id(),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  direction: libraryDirection("direction").notNull(),
  roomId: uuid("room_id").notNull().references(() => rooms.id), // destination
  departmentId: uuid("department_id").references(() => departments.id), // borrowing ward on check-out
  locationEventId: bigint("location_event_id", { mode: "number" }).notNull().references(() => locationEvents.id),
  byUserId: uuid("by_user_id").notNull().references(() => users.id),
  cleaned: boolean("cleaned"),
  charged: boolean("charged"),
  occurredAt: stamp("occurred_at"),
}, (t) => [index("lm_asset_time_idx").on(t.assetId, t.occurredAt.desc())]);

export const ppmSchedules = pgTable("ppm_schedules", {
  id: id(),
  assetId: uuid("asset_id").notNull().unique().references(() => assets.id),
  intervalMonths: smallint("interval_months").notNull(),
  lastDoneOn: date("last_done_on"),
  nextDueOn: date("next_due_on").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: stamp("created_at"),
  updatedAt: stamp("updated_at"),
}, (t) => [index("ppm_next_due_idx").on(t.nextDueOn).where(sql`${t.active}`)]);

// ---------- safety notices ----------
export const safetyNotices = pgTable("safety_notices", {
  id: id(),
  reference: text("reference").notNull().unique(), // e.g. NatPSA/2026/004/MHRA
  source: noticeSource("source").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requiredAction: text("required_action").notNull(),
  issuedOn: date("issued_on").notNull(),
  deadline: date("deadline").notNull(),
  quarantineRequired: boolean("quarantine_required").notNull().default(true),
  status: noticeStatus("status").notNull().default("open"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: stamp("created_at"),
  closedAt: ts("closed_at"),
}, (t) => [index("sn_status_deadline_idx").on(t.status, t.deadline)]);

export const safetyNoticeCriteria = pgTable("safety_notice_criteria", {
  id: id(),
  noticeId: uuid("notice_id").notNull().references(() => safetyNotices.id),
  deviceModelId: uuid("device_model_id").notNull().references(() => deviceModels.id),
  serialFrom: text("serial_from"), // inclusive; null = no lower bound
  serialTo: text("serial_to"), // inclusive; null = no upper bound
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
  matchedAt: stamp("matched_at"),
  actionedAt: ts("actioned_at"),
  actionedById: uuid("actioned_by_id").references(() => users.id),
}, (t) => [
  uniqueIndex("snm_notice_asset_uq").on(t.noticeId, t.assetId),
  index("snm_asset_status_idx").on(t.assetId, t.status),
]);

// ---------- work ----------
export type InspectionRecord = {
  clean: boolean;
  decontaminated: boolean;
  controlSettings: string;
  notes?: string;
};

export const workOrders = pgTable("work_orders", {
  id: id(),
  number: text("number").notNull().unique(), // WO-000123
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
  inspection: jsonb("inspection").$type<InspectionRecord>(),
  calibrationNotes: text("calibration_notes"),
  outcome: workOrderOutcome("outcome"),
  dueOn: date("due_on"),
  createdAt: stamp("created_at"),
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
  unit: text("unit"), // copied from the template item at test time
  lowerLimit: numeric("lower_limit"),
  upperLimit: numeric("upper_limit"),
  outcome: testOutcome("outcome").notNull(), // computed server-side for measurements
  analyserAssetId: uuid("analyser_asset_id").references(() => assets.id),
  recordedById: uuid("recorded_by_id").notNull().references(() => users.id),
  recordedAt: stamp("recorded_at"),
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
  recordedAt: stamp("recorded_at"),
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
  createdAt: stamp("created_at"),
}, (t) => [
  index("inc_asset_idx").on(t.assetId),
  index("inc_status_time_idx").on(t.status, t.occurredAt.desc()),
  check("inc_mhra_ck", sql`not ${t.reportedToMhra} or (${t.yellowCardRef} is not null and ${t.reportedToMhraAt} is not null)`),
]);

// ---------- audit ----------
// Append-only. Written only by the audit_row() trigger; UPDATE, DELETE and TRUNCATE raise.
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  action: auditAction("action").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value").notNull(),
  userId: uuid("user_id").references(() => users.id),
  occurredAt: stamp("occurred_at"),
}, (t) => [
  index("al_record_idx").on(t.tableName, t.recordId, t.occurredAt),
  index("al_user_time_idx").on(t.userId, t.occurredAt),
  index("al_time_idx").on(t.occurredAt),
]);

// ---------- views (defined in hand-written SQL) ----------
export const assetCurrentLocation = pgView("asset_current_location", {
  assetId: uuid("asset_id").notNull(),
  roomId: uuid("room_id").notNull(),
  source: locationSource("source").notNull(),
  occurredAt: ts("occurred_at").notNull(),
}).existing();

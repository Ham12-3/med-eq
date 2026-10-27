CREATE TYPE "public"."acquisition_type" AS ENUM('purchased', 'leased', 'manufacturer_loan', 'donated');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update');--> statement-breakpoint
CREATE TYPE "public"."corridor_side" AS ENUM('north', 'south');--> statement-breakpoint
CREATE TYPE "public"."device_category" AS ENUM('life_support', 'resuscitation', 'infusion', 'monitoring', 'diagnostic', 'therapy', 'patient_handling', 'test_equipment');--> statement-breakpoint
CREATE TYPE "public"."harm_level" AS ENUM('no_harm', 'low', 'moderate', 'severe', 'death');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'under_investigation', 'closed');--> statement-breakpoint
CREATE TYPE "public"."library_direction" AS ENUM('check_out', 'check_in');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_status" AS ENUM('acceptance', 'in_service', 'under_repair', 'quarantined', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."location_source" AS ENUM('scan', 'manual', 'rfid', 'ble');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('open', 'actioned', 'not_affected');--> statement-breakpoint
CREATE TYPE "public"."notice_source" AS ENUM('natpsa', 'mhra_dsi', 'fsn');--> statement-breakpoint
CREATE TYPE "public"."notice_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('ward', 'single_room', 'store_room', 'equipment_library', 'workshop', 'theatre', 'other');--> statement-breakpoint
CREATE TYPE "public"."test_group" AS ENUM('inspection', 'calibration', 'electrical_safety', 'performance');--> statement-breakpoint
CREATE TYPE "public"."test_item_kind" AS ENUM('measurement', 'check');--> statement-breakpoint
CREATE TYPE "public"."test_outcome" AS ENUM('pass', 'fail', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."test_phase" AS ENUM('before', 'after');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('technician', 'manager', 'ward', 'library', 'admin');--> statement-breakpoint
CREATE TYPE "public"."work_order_outcome" AS ENUM('returned_to_use', 'failed_quarantined', 'no_fault_found', 'beyond_economic_repair', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."work_order_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('open', 'in_progress', 'awaiting_parts', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."work_order_type" AS ENUM('ppm', 'repair', 'acceptance', 'recall');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"giai" text NOT NULL,
	"serial_number" text NOT NULL,
	"device_model_id" uuid NOT NULL,
	"owner_department_id" uuid NOT NULL,
	"lifecycle_status" "lifecycle_status" DEFAULT 'acceptance' NOT NULL,
	"in_use" boolean DEFAULT false NOT NULL,
	"acquisition_type" "acquisition_type" DEFAULT 'purchased' NOT NULL,
	"purchase_date" date,
	"purchase_price_pence" integer,
	"end_of_life_date" date,
	"firmware_version" text,
	"accepted_at" timestamp with time zone,
	"decommissioned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_giai_unique" UNIQUE("giai"),
	CONSTRAINT "assets_giai_ck" CHECK (char_length("assets"."giai") between 8 and 30)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text NOT NULL,
	"category" "device_category" NOT NULL,
	"ppm_interval_months" smallint NOT NULL,
	"ppm_interval_reason" text,
	"test_template_id" uuid NOT NULL,
	"em_function" smallint NOT NULL,
	"em_physical_risk" smallint NOT NULL,
	"em_maintenance" smallint NOT NULL,
	"width_cm" smallint,
	"depth_cm" smallint,
	"height_cm" smallint,
	"is_test_equipment" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_models_slug_unique" UNIQUE("slug"),
	CONSTRAINT "dm_interval_ck" CHECK ("device_models"."ppm_interval_months" between 1 and 24),
	CONSTRAINT "dm_em_function_ck" CHECK ("device_models"."em_function" between 2 and 10),
	CONSTRAINT "dm_em_risk_ck" CHECK ("device_models"."em_physical_risk" between 1 and 5),
	CONSTRAINT "dm_em_maint_ck" CHECK ("device_models"."em_maintenance" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "em_score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_model_id" uuid NOT NULL,
	"function" smallint NOT NULL,
	"physical_risk" smallint NOT NULL,
	"maintenance" smallint NOT NULL,
	"incident_history" smallint NOT NULL,
	"total" smallint NOT NULL,
	"failures_per_asset_year" numeric NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emh_history_ck" CHECK ("em_score_history"."incident_history" between -2 and 2)
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"asset_id" uuid,
	"room_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"harm_level" "harm_level" NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"reported_by_id" uuid NOT NULL,
	"reported_to_mhra" boolean DEFAULT false NOT NULL,
	"yellow_card_ref" text,
	"reported_to_mhra_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_reference_unique" UNIQUE("reference"),
	CONSTRAINT "inc_mhra_ck" CHECK (not "incidents"."reported_to_mhra" or ("incidents"."yellow_card_ref" is not null and "incidents"."reported_to_mhra_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "library_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"direction" "library_direction" NOT NULL,
	"room_id" uuid NOT NULL,
	"department_id" uuid,
	"location_event_id" bigint NOT NULL,
	"by_user_id" uuid NOT NULL,
	"cleaned" boolean,
	"charged" boolean,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"source" "location_source" NOT NULL,
	"scanned_by_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "le_scanner_ck" CHECK ("location_events"."source" not in ('scan', 'manual') or "location_events"."scanned_by_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "parts_used" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"part_number" text NOT NULL,
	"description" text NOT NULL,
	"supplier" text NOT NULL,
	"lot_number" text,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppm_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"interval_months" smallint NOT NULL,
	"last_done_on" date,
	"next_due_on" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ppm_schedules_asset_id_unique" UNIQUE("asset_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"floor_id" uuid NOT NULL,
	"department_id" uuid,
	"gln" text NOT NULL,
	"mesh_id" text NOT NULL,
	"name" text NOT NULL,
	"room_type" "room_type" NOT NULL,
	"corridor_position" smallint NOT NULL,
	"corridor_side" "corridor_side" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_gln_unique" UNIQUE("gln"),
	CONSTRAINT "rooms_mesh_id_unique" UNIQUE("mesh_id"),
	CONSTRAINT "rooms_gln_ck" CHECK ("rooms"."gln" ~ '^[0-9]{13}$'),
	CONSTRAINT "rooms_mesh_id_ck" CHECK ("rooms"."mesh_id" = 'room_' || "rooms"."gln")
);
--> statement-breakpoint
CREATE TABLE "safety_notice_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"device_model_id" uuid NOT NULL,
	"serial_from" text,
	"serial_to" text,
	"firmware_versions" text[]
);
--> statement-breakpoint
CREATE TABLE "safety_notice_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"criteria_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'open' NOT NULL,
	"room_id_at_match" uuid,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actioned_at" timestamp with time zone,
	"actioned_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "safety_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"source" "notice_source" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"required_action" text NOT NULL,
	"issued_on" date NOT NULL,
	"deadline" date NOT NULL,
	"quarantine_required" boolean DEFAULT true NOT NULL,
	"status" "notice_status" DEFAULT 'open' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "safety_notices_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gln" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_gln_unique" UNIQUE("gln"),
	CONSTRAINT "sites_gln_ck" CHECK ("sites"."gln" ~ '^[0-9]{13}$')
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"template_item_id" uuid NOT NULL,
	"phase" "test_phase" DEFAULT 'after' NOT NULL,
	"measured_value" numeric,
	"unit" text,
	"lower_limit" numeric,
	"upper_limit" numeric,
	"outcome" "test_outcome" NOT NULL,
	"analyser_asset_id" uuid,
	"recorded_by_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "test_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"group" "test_group" NOT NULL,
	"kind" "test_item_kind" NOT NULL,
	"unit" text,
	"lower_limit" numeric,
	"upper_limit" numeric,
	"required" boolean DEFAULT true NOT NULL,
	"requires_analyser" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tti_limits_ck" CHECK ("test_template_items"."kind" = 'check' or "test_template_items"."lower_limit" is not null or "test_template_items"."upper_limit" is not null)
);
--> statement-breakpoint
CREATE TABLE "test_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"standard" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" "user_role" NOT NULL,
	"department_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"type" "work_order_type" NOT NULL,
	"status" "work_order_status" DEFAULT 'open' NOT NULL,
	"priority" "work_order_priority" DEFAULT 'normal' NOT NULL,
	"asset_id" uuid NOT NULL,
	"ppm_schedule_id" uuid,
	"safety_notice_match_id" uuid,
	"test_template_id" uuid,
	"assignee_id" uuid,
	"reported_by_id" uuid NOT NULL,
	"fault_reason" text,
	"fault_photo_path" text,
	"inspection" jsonb,
	"calibration_notes" text,
	"outcome" "work_order_outcome",
	"due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_by_id" uuid,
	CONSTRAINT "work_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "wo_ppm_ck" CHECK ("work_orders"."type" <> 'ppm' or "work_orders"."ppm_schedule_id" is not null),
	CONSTRAINT "wo_recall_ck" CHECK ("work_orders"."type" <> 'recall' or "work_orders"."safety_notice_match_id" is not null),
	CONSTRAINT "wo_completed_ck" CHECK ("work_orders"."status" <> 'completed' or ("work_orders"."completed_at" is not null and "work_orders"."outcome" is not null))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_department_id_departments_id_fk" FOREIGN KEY ("owner_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_test_template_id_test_templates_id_fk" FOREIGN KEY ("test_template_id") REFERENCES "public"."test_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "em_score_history" ADD CONSTRAINT "em_score_history_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_movements" ADD CONSTRAINT "library_movements_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_movements" ADD CONSTRAINT "library_movements_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_movements" ADD CONSTRAINT "library_movements_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_movements" ADD CONSTRAINT "library_movements_location_event_id_location_events_id_fk" FOREIGN KEY ("location_event_id") REFERENCES "public"."location_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_movements" ADD CONSTRAINT "library_movements_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_scanned_by_id_users_id_fk" FOREIGN KEY ("scanned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_used" ADD CONSTRAINT "parts_used_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_used" ADD CONSTRAINT "parts_used_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppm_schedules" ADD CONSTRAINT "ppm_schedules_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_criteria" ADD CONSTRAINT "safety_notice_criteria_notice_id_safety_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."safety_notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_criteria" ADD CONSTRAINT "safety_notice_criteria_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_matches" ADD CONSTRAINT "safety_notice_matches_notice_id_safety_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."safety_notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_matches" ADD CONSTRAINT "safety_notice_matches_criteria_id_safety_notice_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."safety_notice_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_matches" ADD CONSTRAINT "safety_notice_matches_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_matches" ADD CONSTRAINT "safety_notice_matches_room_id_at_match_rooms_id_fk" FOREIGN KEY ("room_id_at_match") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_matches" ADD CONSTRAINT "safety_notice_matches_actioned_by_id_users_id_fk" FOREIGN KEY ("actioned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notices" ADD CONSTRAINT "safety_notices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_template_item_id_test_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."test_template_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_analyser_asset_id_assets_id_fk" FOREIGN KEY ("analyser_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_template_items" ADD CONSTRAINT "test_template_items_template_id_test_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."test_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_ppm_schedule_id_ppm_schedules_id_fk" FOREIGN KEY ("ppm_schedule_id") REFERENCES "public"."ppm_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_safety_notice_match_id_safety_notice_matches_id_fk" FOREIGN KEY ("safety_notice_match_id") REFERENCES "public"."safety_notice_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_test_template_id_test_templates_id_fk" FOREIGN KEY ("test_template_id") REFERENCES "public"."test_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_model_serial_uq" ON "assets" USING btree ("device_model_id","serial_number");--> statement-breakpoint
CREATE INDEX "assets_model_idx" ON "assets" USING btree ("device_model_id");--> statement-breakpoint
CREATE INDEX "assets_dept_idx" ON "assets" USING btree ("owner_department_id");--> statement-breakpoint
CREATE INDEX "assets_lifecycle_idx" ON "assets" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE INDEX "assets_eol_idx" ON "assets" USING btree ("end_of_life_date");--> statement-breakpoint
CREATE INDEX "al_record_idx" ON "audit_log" USING btree ("table_name","record_id","occurred_at");--> statement-breakpoint
CREATE INDEX "al_user_time_idx" ON "audit_log" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "al_time_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_site_code_uq" ON "buildings" USING btree ("site_id","code");--> statement-breakpoint
CREATE INDEX "device_models_category_idx" ON "device_models" USING btree ("category");--> statement-breakpoint
CREATE INDEX "emh_model_time_idx" ON "em_score_history" USING btree ("device_model_id","calculated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "floors_building_level_uq" ON "floors" USING btree ("building_id","level");--> statement-breakpoint
CREATE INDEX "inc_asset_idx" ON "incidents" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "inc_status_time_idx" ON "incidents" USING btree ("status","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lm_asset_time_idx" ON "library_movements" USING btree ("asset_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "le_asset_time_idx" ON "location_events" USING btree ("asset_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "le_room_time_idx" ON "location_events" USING btree ("room_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pu_wo_idx" ON "parts_used" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "pu_lot_idx" ON "parts_used" USING btree ("lot_number");--> statement-breakpoint
CREATE INDEX "pu_part_idx" ON "parts_used" USING btree ("part_number");--> statement-breakpoint
CREATE INDEX "ppm_next_due_idx" ON "ppm_schedules" USING btree ("next_due_on") WHERE "ppm_schedules"."active";--> statement-breakpoint
CREATE INDEX "rooms_floor_idx" ON "rooms" USING btree ("floor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_floor_slot_uq" ON "rooms" USING btree ("floor_id","corridor_position","corridor_side");--> statement-breakpoint
CREATE INDEX "snc_notice_idx" ON "safety_notice_criteria" USING btree ("notice_id");--> statement-breakpoint
CREATE INDEX "snc_model_idx" ON "safety_notice_criteria" USING btree ("device_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snm_notice_asset_uq" ON "safety_notice_matches" USING btree ("notice_id","asset_id");--> statement-breakpoint
CREATE INDEX "snm_asset_status_idx" ON "safety_notice_matches" USING btree ("asset_id","status");--> statement-breakpoint
CREATE INDEX "sn_status_deadline_idx" ON "safety_notices" USING btree ("status","deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "tr_wo_item_phase_uq" ON "test_results" USING btree ("work_order_id","template_item_id","phase");--> statement-breakpoint
CREATE INDEX "tr_wo_idx" ON "test_results" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "tr_outcome_time_idx" ON "test_results" USING btree ("outcome","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tr_analyser_idx" ON "test_results" USING btree ("analyser_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tti_template_code_uq" ON "test_template_items" USING btree ("template_id","code");--> statement-breakpoint
CREATE INDEX "tti_template_idx" ON "test_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "test_templates_code_version_uq" ON "test_templates" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "wo_assignee_status_idx" ON "work_orders" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "wo_queue_idx" ON "work_orders" USING btree ("status","priority","due_on");--> statement-breakpoint
CREATE INDEX "wo_asset_time_idx" ON "work_orders" USING btree ("asset_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wo_one_open_ppm_uq" ON "work_orders" USING btree ("ppm_schedule_id") WHERE "work_orders"."status" in ('open', 'in_progress', 'awaiting_parts');
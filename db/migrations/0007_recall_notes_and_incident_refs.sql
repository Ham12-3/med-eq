CREATE SEQUENCE "public"."incident_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "reference" SET DEFAULT 'INC-' || lpad(nextval('incident_reference_seq')::text, 5, '0');--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "action_notes" text;
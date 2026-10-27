CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"page" text NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sv_user_page_idx" ON "saved_views" USING btree ("user_id","page");--> statement-breakpoint
CREATE INDEX "wo_asset_completed_idx" ON "work_orders" USING btree ("asset_id","completed_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "work_orders"."status" = 'completed';
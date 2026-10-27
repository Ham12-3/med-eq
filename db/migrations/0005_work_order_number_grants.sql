-- Databases that already hold jobs carry on from their highest number (a fresh one starts at 1).
SELECT setval('work_order_number_seq', coalesce((SELECT max(substring(number FROM 4)::int) FROM work_orders), 0) + 1, false);
--> statement-breakpoint
-- The app role already has USAGE (for nextval) through the default privileges in 0001.
-- The seed, which runs as the app role, also moves the sequence past the seeded numbers with setval.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medasset_app') THEN
    GRANT USAGE, SELECT, UPDATE ON SEQUENCE work_order_number_seq TO medasset_app;
  END IF;
END $$;

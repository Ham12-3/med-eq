-- Records are never deleted or overwritten, and every change is attributed to a user.
-- The app sets app.user_id in each transaction (db/client.ts withUser); a write without it fails.
-- New tables in later migrations must call: SELECT medasset_protect('table_name');

CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  uid text := current_setting('app.user_id', true);
BEGIN
  IF uid IS NULL OR uid = '' THEN
    RAISE EXCEPTION 'app.user_id is not set: every write to % must be attributed to a user', TG_TABLE_NAME
      USING ERRCODE = 'MA001';
  END IF;
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NULL;
  END IF;
  INSERT INTO audit_log (table_name, record_id, action, old_value, new_value, user_id)
  VALUES (
    TG_TABLE_NAME,
    NEW.id::text,
    lower(TG_OP)::audit_action,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END,
    to_jsonb(NEW),
    uid::uuid
  );
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: records are never deleted or overwritten', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'MA002';
END $$;
--> statement-breakpoint
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF row(NEW.*) IS DISTINCT FROM row(OLD.*) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION medasset_protect(tbl regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER audit_row AFTER INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION audit_row()', tbl);
  EXECUTE format('CREATE TRIGGER forbid_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION forbid_change()', tbl);
  EXECUTE format('CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()', tbl);
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl AND attname = 'updated_at' AND NOT attisdropped) THEN
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  t regclass;
BEGIN
  FOR t IN
    SELECT c.oid::regclass
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'audit_log'
  LOOP
    PERFORM medasset_protect(t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
-- One index probe per asset on le_asset_time_idx. The ORDER BY must match the
-- index exactly (DESC NULLS LAST) or Postgres falls back to sorting.
CREATE VIEW asset_current_location AS
SELECT a.id AS asset_id, l.room_id, l.source, l.occurred_at
FROM assets a
CROSS JOIN LATERAL (
  SELECT e.room_id, e.source, e.occurred_at
  FROM location_events e
  WHERE e.asset_id = a.id
  ORDER BY e.occurred_at DESC NULLS LAST, e.id DESC NULLS LAST
  LIMIT 1
) l;
--> statement-breakpoint
-- The app role can read, insert and update, but never delete, and only append to audit_log.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medasset_app') THEN
    GRANT USAGE ON SCHEMA public TO medasset_app;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO medasset_app;
    REVOKE UPDATE ON audit_log FROM medasset_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medasset_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO medasset_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO medasset_app;
  END IF;
END $$;

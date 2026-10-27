-- The seed gives location events explicit ids (library movements point at them), then moves
-- the id sequence on with setval, which needs UPDATE on the sequence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medasset_app') THEN
    GRANT USAGE, SELECT, UPDATE ON SEQUENCE location_events_id_seq TO medasset_app;
  END IF;
END $$;

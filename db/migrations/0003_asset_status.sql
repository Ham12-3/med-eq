-- New tables get the audit and no-delete triggers (see 0001_guarantees.sql).
SELECT medasset_protect('saved_views');
--> statement-breakpoint
-- The facts the "Do not use" rules need, one row per asset. PLAN.md section 3.2.
-- The latest-test lookup's ORDER BY matches wo_asset_completed_idx exactly.
CREATE VIEW asset_status_facts AS
SELECT
  a.id AS asset_id,
  a.lifecycle_status,
  a.in_use,
  p.next_due_on,
  coalesce(latest.failed, false) AS latest_test_failed,
  (
    SELECT count(*)::int
    FROM safety_notice_matches m
    JOIN safety_notices n ON n.id = m.notice_id
    WHERE m.asset_id = a.id AND m.status = 'open' AND n.quarantine_required
  ) AS open_notice_matches,
  EXISTS (
    SELECT 1 FROM work_orders w
    WHERE w.asset_id = a.id AND w.type = 'repair' AND w.status IN ('open', 'in_progress', 'awaiting_parts')
  ) AS open_fault_report
FROM assets a
LEFT JOIN ppm_schedules p ON p.asset_id = a.id AND p.active
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1
    FROM test_results r
    JOIN test_template_items i ON i.id = r.template_item_id
    WHERE r.work_order_id = w.id AND r.phase = 'after' AND i.required AND r.outcome = 'fail'
  ) AS failed
  FROM work_orders w
  WHERE w.asset_id = a.id AND w.status = 'completed'
    AND EXISTS (SELECT 1 FROM test_results r WHERE r.work_order_id = w.id)
  ORDER BY w.completed_at DESC NULLS LAST, w.id DESC NULLS LAST
  LIMIT 1
) latest ON true;
--> statement-breakpoint
-- Mirrors deriveAssetStatus() in lib/rules/assetStatus.ts. "Today" is a parameter
-- (Europe/London, passed by the app) so tests can pin it.
CREATE FUNCTION asset_status_on(p_today date)
RETURNS TABLE (asset_id uuid, do_not_use boolean, reasons text[], display_status text)
LANGUAGE sql STABLE AS $$
  SELECT
    f.asset_id,
    cardinality(r.reasons) > 0,
    r.reasons,
    CASE
      WHEN f.lifecycle_status = 'decommissioned' THEN 'decommissioned'
      WHEN f.open_notice_matches > 0 THEN 'recalled'
      WHEN cardinality(r.reasons) > 0 THEN 'do_not_use'
      WHEN f.next_due_on IS NOT NULL AND f.next_due_on - 14 <= p_today THEN 'due_soon'
      WHEN f.in_use THEN 'in_use'
      ELSE 'available'
    END
  FROM asset_status_facts f
  CROSS JOIN LATERAL (
    SELECT array_remove(ARRAY[
      CASE WHEN f.lifecycle_status IN ('acceptance', 'under_repair', 'quarantined', 'decommissioned') THEN 'NOT_IN_SERVICE' END,
      CASE WHEN f.next_due_on < p_today THEN 'PPM_OVERDUE' END,
      CASE WHEN f.latest_test_failed THEN 'FAILED_TEST' END,
      CASE WHEN f.open_notice_matches > 0 THEN 'SAFETY_NOTICE' END,
      CASE WHEN f.open_fault_report THEN 'FAULT_REPORTED' END
    ], NULL) AS reasons
  ) r
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medasset_app') THEN
    GRANT SELECT ON asset_status_facts TO medasset_app;
    GRANT EXECUTE ON FUNCTION asset_status_on(date) TO medasset_app;
  END IF;
END $$;

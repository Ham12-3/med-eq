// Fennigkoh and Smith EM scores, recalculated nightly with a dated history. PLAN.md section 4.

import { eq, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { deviceModels, emScoreHistory } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { emScore, incidentHistoryScore } from "@/lib/rules/emScore";

type Reader = Db | Tx;

/** The latest EM total per model, falling back to the base score before any history exists. */
export const LATEST_EM = (modelAlias: string) => sql.raw(`coalesce(
  (select h.total from em_score_history h where h.device_model_id = ${modelAlias}.id order by h.calculated_at desc limit 1),
  ${modelAlias}.em_function + ${modelAlias}.em_physical_risk + ${modelAlias}.em_maintenance)::int`);

type ModelFailures = {
  modelId: string;
  fn: number;
  risk: number;
  maintenance: number;
  assets: number;
  failures: number;
  scoredToday: boolean;
};

/**
 * Failures in the 24 months to `today`: repair jobs (other than no fault found or cancelled)
 * plus incidents, across the model's assets that are not decommissioned.
 */
async function failuresByModel(db: Reader, today: IsoDate, modelId?: string) {
  return db.execute<ModelFailures>(sql`
    select m.id as "modelId", m.em_function as fn, m.em_physical_risk as risk, m.em_maintenance as maintenance,
      (select count(*) from assets a where a.device_model_id = m.id and a.lifecycle_status <> 'decommissioned')::int as assets,
      ((select count(*) from work_orders w join assets a on a.id = w.asset_id
        where a.device_model_id = m.id and w.type = 'repair' and w.status <> 'cancelled'
          and (w.outcome is null or w.outcome <> 'no_fault_found')
          and w.created_at >= (${today}::date - interval '24 months') and w.created_at < (${today}::date + 1))
      + (select count(*) from incidents i join assets a on a.id = i.asset_id
        where a.device_model_id = m.id
          and i.occurred_at >= (${today}::date - interval '24 months') and i.occurred_at < (${today}::date + 1)))::int as failures,
      exists (select 1 from em_score_history h where h.device_model_id = m.id
        and (h.calculated_at at time zone 'Europe/London')::date = ${today}::date) as "scoredToday"
    from device_models m
    ${modelId ? sql`where m.id = ${modelId}` : sql``}`);
}

export function scoreFrom(f: Pick<ModelFailures, "fn" | "risk" | "maintenance" | "assets" | "failures">) {
  const failuresPerAssetYear = f.assets > 0 ? f.failures / (f.assets * 2) : 0;
  const incidentHistory = incidentHistoryScore(failuresPerAssetYear);
  return {
    incidentHistory,
    failuresPerAssetYear,
    total: emScore({ function: f.fn, physicalRisk: f.risk, maintenance: f.maintenance, incidentHistory }),
  };
}

/**
 * Adds today's score for every model not yet scored today. `modelId` re-scores that one model,
 * for example after its function, risk or maintenance scores were changed.
 * `at` stamps the scores; it defaults to the database clock. The seed passes a time on its seeded day.
 */
export async function recalculateEmScores(tx: Tx, today: IsoDate, options: { modelId?: string; at?: Date } = {}): Promise<number> {
  const rows = await failuresByModel(tx, today, options.modelId);
  let written = 0;
  for (const row of rows) {
    if (row.scoredToday && !options.modelId) continue;
    const score = scoreFrom(row);
    await tx.insert(emScoreHistory).values({
      deviceModelId: row.modelId, function: row.fn, physicalRisk: row.risk, maintenance: row.maintenance,
      incidentHistory: score.incidentHistory, total: score.total,
      failuresPerAssetYear: score.failuresPerAssetYear.toFixed(4), calculatedAt: options.at,
    });
    written++;
  }
  return written;
}

export type ModelScore = {
  id: string;
  slug: string;
  name: string;
  category: string;
  isTestEquipment: boolean;
  intervalMonths: number;
  intervalReason: string | null;
  fn: number;
  risk: number;
  maintenance: number;
  incidentHistory: number | null;
  total: number | null;
  failuresPerAssetYear: string | null;
  calculatedOn: string | null;
  assets: number;
};

export async function listModelScores(db: Reader): Promise<ModelScore[]> {
  const rows = await db.execute<ModelScore>(sql`
    select m.id, m.slug, m.name, m.category, m.is_test_equipment as "isTestEquipment",
           m.ppm_interval_months as "intervalMonths", m.ppm_interval_reason as "intervalReason",
           m.em_function as fn, m.em_physical_risk as risk, m.em_maintenance as maintenance,
           h.incident_history as "incidentHistory", h.total, h.failures_per_asset_year::text as "failuresPerAssetYear",
           to_char(h.calculated_at at time zone 'Europe/London', 'YYYY-MM-DD') as "calculatedOn",
           (select count(*)::int from assets a where a.device_model_id = m.id and a.lifecycle_status <> 'decommissioned') as assets
    from device_models m
    left join lateral (select * from em_score_history x where x.device_model_id = m.id order by x.calculated_at desc limit 1) h on true
    order by h.total desc nulls last, m.name`);
  return [...rows];
}

export async function scoreHistory(db: Reader, modelId: string) {
  const rows = await db.execute<{ id: string; on: string; fn: number; risk: number; maintenance: number; incidentHistory: number; total: number; failuresPerAssetYear: string }>(sql`
    select id, to_char(calculated_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as on,
           function as fn, physical_risk as risk, maintenance, incident_history as "incidentHistory", total,
           failures_per_asset_year::text as "failuresPerAssetYear"
    from em_score_history where device_model_id = ${modelId} order by calculated_at desc limit 60`);
  return [...rows];
}

/** Changes the three judged parts of a model's score, then re-scores it straight away. */
export async function updateEmParts(tx: Tx, modelId: string, parts: { fn: number; risk: number; maintenance: number }, today: IsoDate) {
  await tx.update(deviceModels).set({ emFunction: parts.fn, emPhysicalRisk: parts.risk, emMaintenance: parts.maintenance })
    .where(eq(deviceModels.id, modelId));
  await recalculateEmScores(tx, today, { modelId });
}

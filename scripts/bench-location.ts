// pnpm db:bench: times current location and status at 50,000 assets.
// Builds a throwaway database, medasset_bench, from the real migrations, bulk-loads
// synthetic rows with triggers off (it is never used for anything else), then
// times the queries the asset register runs. PLAN.md M2 step 1.

import { existsSync } from "node:fs";
import postgres from "postgres";
import { migrateDatabase } from "@/db/migrate";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const ASSETS = 50_000;
const EVENTS_PER_ASSET = 20;
const JOBS_PER_ASSET = 3;

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is not set");
const benchUrl = ownerUrl.replace(/\/[^/?]+(\?|$)/, "/medasset_bench$1");

async function time(sql: postgres.Sql, label: string, query: string) {
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const plan = await sql.unsafe<{ "QUERY PLAN": unknown }[]>(`explain (analyze, format json) ${query}`);
    const json = plan[0]["QUERY PLAN"] as { "Execution Time": number }[];
    runs.push(json[0]["Execution Time"]);
  }
  runs.sort((a, b) => a - b);
  return { query: label, "median ms": Number(runs[2].toFixed(2)), "best ms": Number(runs[0].toFixed(2)) };
}

async function main() {
  const admin = postgres(ownerUrl!.replace(/\/[^/?]+(\?|$)/, "/postgres$1"), { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists medasset_bench with (force)");
  await admin.unsafe("create database medasset_bench");
  await admin.end();
  await migrateDatabase(benchUrl);

  const sql = postgres(benchUrl, { max: 1, onnotice: () => {} });
  const started = Date.now();
  await sql.begin(async (tx) => {
    await tx.unsafe("set local session_replication_role = replica"); // skip audit triggers for the bulk load
    await tx.unsafe(`
      insert into departments (id, code, name) values ('00000000-0000-4000-8000-0000000000d1', 'D', 'Bench');
      insert into users (id, email, name, initials, role) values ('00000000-0000-4000-8000-0000000000a1', 'bench@example.test', 'Bench', 'BE', 'technician');
      insert into sites (id, gln, name) values ('00000000-0000-4000-8000-0000000000c1', '0299999000017', 'Bench');
      insert into buildings (id, site_id, code, name) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', 'B', 'Bench');
      insert into floors (id, building_id, level, name) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1', 0, 'G');
      insert into rooms (floor_id, gln, mesh_id, name, room_type, corridor_position, corridor_side)
        select '00000000-0000-4000-8000-0000000000f1', g, 'room_' || g, 'Room ' || n, 'ward', n / 2, case when n % 2 = 0 then 'north' else 'south' end::corridor_side
        from (select n, '02999991' || lpad(n::text, 5, '0') as g from generate_series(1, 400) n) r;
      insert into test_templates (id, code, name) values ('00000000-0000-4000-8000-0000000000e1', 'B', 'Bench');
      insert into test_template_items (id, template_id, position, code, name, "group", kind, upper_limit)
        values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e1', 0, 'EL', 'Leakage', 'electrical_safety', 'measurement', 500);
      insert into device_models (id, slug, name, manufacturer, category, ppm_interval_months, test_template_id, em_function, em_physical_risk, em_maintenance)
        values ('00000000-0000-4000-8000-0000000000e3', 'bench', 'Bench device', 'Bench', 'infusion', 12, '00000000-0000-4000-8000-0000000000e1', 9, 5, 4);
      insert into assets (giai, serial_number, device_model_id, owner_department_id, lifecycle_status)
        select '0299999BEN' || lpad(n::text, 6, '0'), 'S' || n, '00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d1', 'in_service'
        from generate_series(1, ${ASSETS}) n;
      insert into ppm_schedules (asset_id, interval_months, next_due_on)
        select id, 12, current_date + (random() * 400 - 30)::int from assets;
      insert into location_events (asset_id, room_id, source, occurred_at)
        select a.id, r.id, 'rfid', now() - (e * interval '3 days') - random() * interval '1 day'
        from assets a cross join generate_series(1, ${EVENTS_PER_ASSET}) e
        join lateral (select id from rooms order by random() + 0 * e limit 1) r on true;
      insert into work_orders (number, type, status, priority, asset_id, test_template_id, reported_by_id, outcome, created_at, completed_at)
        select 'WO-' || a.giai || '-' || j, 'repair', 'completed', 'normal', a.id, '00000000-0000-4000-8000-0000000000e1',
               '00000000-0000-4000-8000-0000000000a1', 'returned_to_use', now() - j * interval '90 days', now() - j * interval '89 days'
        from assets a cross join generate_series(1, ${JOBS_PER_ASSET}) j;
      insert into test_results (work_order_id, template_item_id, measured_value, outcome, recorded_by_id)
        select w.id, '00000000-0000-4000-8000-0000000000e2', 120, case when random() < 0.02 then 'fail' else 'pass' end::test_outcome,
               '00000000-0000-4000-8000-0000000000a1'
        from work_orders w;
    `);
  });
  await sql.unsafe("analyze");
  const [{ events }] = await sql<{ events: number }[]>`select count(*)::int as events from location_events`;
  console.log(`Loaded ${ASSETS.toLocaleString()} assets, ${events.toLocaleString()} location events in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);

  const [{ id }] = await sql<{ id: string }[]>`select id from assets order by giai offset 25000 limit 1`;
  const results = [
    await time(sql, "current location, one asset", `select * from asset_current_location where asset_id = '${id}'`),
    await time(sql, "status, one asset", `select * from asset_status_on(current_date) where asset_id = '${id}'`),
    await time(sql, "register page: 50 rows with location and status", `
      select a.giai, l.room_id, s.display_status
      from assets a
      join asset_current_location l on l.asset_id = a.id
      join asset_status_on(current_date) s on s.asset_id = a.id
      order by a.giai limit 50`),
    await time(sql, "current location, all assets", `select count(*) from asset_current_location`),
    await time(sql, "status, all assets (count overdue)", `select count(*) from asset_status_on(current_date) where 'PPM_OVERDUE' = any(reasons)`),
  ];
  console.table(results);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

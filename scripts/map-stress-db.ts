// pnpm map:stress-db [--devices=2000]
// Builds a throwaway database, medasset_stress, for timing the 3D map with a crowded floor
// (PLAN.md M5 step 4, the Phase 8 stress case). It migrates and seeds as usual, then adds
// copies of the Main Building ground floor's devices, each in the same room as its original,
// until that floor holds --devices devices. The copies are bulk-loaded with triggers off, so
// they have no audit rows; the database is never used for anything else.
//
// Then run a production server against it and measure:
//   DATABASE_URL=<app url with /medasset_stress> AUTH_TRUST_HOST=true pnpm exec next start -p 3200
//   pnpm map:measure --headed

import { existsSync } from "node:fs";
import postgres from "postgres";
import { createDb } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { todayInLondon } from "@/lib/dates";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const devicesArg = process.argv.find((a) => a.startsWith("--devices="))?.slice("--devices=".length);
const DEVICES = Number(devicesArg ?? 2000);

const ownerUrl = process.env.DATABASE_OWNER_URL;
const appUrl = process.env.DATABASE_URL;
if (!ownerUrl || !appUrl) throw new Error("DATABASE_OWNER_URL and DATABASE_URL must be set");
const toStress = (url: string) => url.replace(/\/[^/?]+(\?|$)/, "/medasset_stress$1");

async function main() {
  const admin = postgres(ownerUrl!.replace(/\/[^/?]+(\?|$)/, "/postgres$1"), { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists medasset_stress with (force)");
  await admin.unsafe("create database medasset_stress");
  await admin.end();
  await migrateDatabase(toStress(ownerUrl!));

  const { client, db } = createDb(toStress(appUrl!), { max: 1 });
  await seedDatabase(db, { today: todayInLondon() });
  await client.end();

  const sql = postgres(toStress(ownerUrl!), { max: 1, onnotice: () => {} });
  const ground = sql`
    select a.id, a.device_model_id, a.owner_department_id, a.lifecycle_status, l.room_id
    from assets a join asset_current_location l on l.asset_id = a.id
    join rooms r on r.id = l.room_id join floors f on f.id = r.floor_id and f.level = 0
    join buildings b on b.id = f.building_id and b.code = 'MAIN'
    where a.lifecycle_status <> 'decommissioned'`;
  const originals = await ground;
  const extra = DEVICES - originals.length;
  if (extra > 0) {
    await sql.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role = replica"); // skip audit triggers for the bulk load
      await tx`
        with src as (
          select a.*, row_number() over (order by a.id) - 1 as i, count(*) over () as n
          from (${ground}) a
        ), copies as (
          select gen_random_uuid() as new_id, g, s.device_model_id, s.owner_department_id, s.lifecycle_status, s.room_id
          from generate_series(0, ${extra - 1}) g join src s on s.i = g % s.n
        ), new_assets as (
          insert into assets (id, giai, serial_number, device_model_id, owner_department_id, lifecycle_status)
          select new_id, '0299999STR' || lpad(g::text, 6, '0'), 'STR' || g, device_model_id, owner_department_id, lifecycle_status
          from copies returning id
        ), schedules as (
          insert into ppm_schedules (asset_id, interval_months, next_due_on)
          select c.new_id, 12, current_date + (c.g % 400 - 30) from copies c
        )
        insert into location_events (asset_id, room_id, source, occurred_at)
        select c.new_id, c.room_id, 'rfid', now() - interval '1 hour' from copies c`;
    });
  }
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from (${ground}) g`;
  await sql.end();
  console.log(`medasset_stress ready: ${n} devices on the Main Building ground floor`);
}

main().catch((error) => { console.error(error); process.exit(1); });

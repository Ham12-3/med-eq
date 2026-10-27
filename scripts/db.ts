// Database commands: pnpm db:migrate | db:seed | db:reset | db:counts
// Add --test to target the test database, --today=YYYY-MM-DD to pin the seed date.

import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { migrateDatabase, resetDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { isIsoDate, todayInLondon } from "@/lib/dates";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  return value;
}

const [command, ...args] = process.argv.slice(2);
const test = args.includes("--test");
const todayArg = args.find((a) => a.startsWith("--today="))?.slice("--today=".length);
if (todayArg && !isIsoDate(todayArg)) throw new Error(`--today must be YYYY-MM-DD, got ${todayArg}`);
const today = todayArg ?? todayInLondon();

const ownerUrl = env(test ? "TEST_DATABASE_OWNER_URL" : "DATABASE_OWNER_URL");
const appUrl = env(test ? "TEST_DATABASE_URL" : "DATABASE_URL");

async function seed() {
  const { client, db } = createDb(appUrl, { max: 1 });
  try {
    const started = Date.now();
    await seedDatabase(db, { today });
    console.log(`Seeded for ${today} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await client.end();
  }
}

async function counts() {
  const { client, db } = createDb(appUrl, { max: 1 });
  try {
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
    const rows: Record<string, number> = {};
    for (const { table_name } of tables) {
      const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table_name)}`);
      rows[table_name] = n;
    }
    console.table(rows);
  } finally {
    await client.end();
  }
}

async function main() {
  switch (command) {
    case "migrate":
      await migrateDatabase(ownerUrl);
      console.log("Migrations applied");
      break;
    case "seed":
      await seed();
      await counts();
      break;
    case "reset":
      await resetDatabase(ownerUrl);
      console.log("Schema dropped and migrated");
      await seed();
      await counts();
      break;
    case "counts":
      await counts();
      break;
    default:
      console.error("Usage: tsx scripts/db.ts <migrate|seed|reset|counts> [--test] [--today=YYYY-MM-DD]");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

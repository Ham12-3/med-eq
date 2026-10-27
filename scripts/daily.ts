// pnpm job:daily [--test] [--today=YYYY-MM-DD]: runs the daily job once.

import { existsSync } from "node:fs";
import { createDb } from "@/db/client";
import { runDailyJob } from "@/lib/jobs/daily";
import { isIsoDate, todayInLondon } from "@/lib/dates";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const todayArg = args.find((a) => a.startsWith("--today="))?.slice("--today=".length);
if (todayArg && !isIsoDate(todayArg)) throw new Error(`--today must be YYYY-MM-DD, got ${todayArg}`);
const url = process.env[args.includes("--test") ? "TEST_DATABASE_URL" : "DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

const { client, db } = createDb(url, { max: 1 });
const today = todayArg ?? todayInLondon();
runDailyJob(db, today)
  .then((r) => console.log(`Daily job for ${today}: ${r.emScored} models scored, ${r.created.length} PPM jobs opened, ${r.reprioritised} reprioritised`))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => client.end());

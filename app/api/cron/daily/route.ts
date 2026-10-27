import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { runDailyJob } from "@/lib/jobs/daily";
import { todayInLondon } from "@/lib/dates";

// Called once a day by the host's scheduler: POST with "Authorization: Bearer $CRON_SECRET".
// Locally, `pnpm job:daily` does the same.

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  const today = todayInLondon();
  const result = await runDailyJob(getDb(), today);
  return Response.json({ today, emScored: result.emScored, created: result.created.length, reprioritised: result.reprioritised });
}

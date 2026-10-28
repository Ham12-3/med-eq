import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { fromLondonLocal, type IsoDate } from "@/lib/dates";
import { runDailyJobIn } from "@/lib/jobs/daily";
import { withUser, type Db, type Tx } from "../client";
import * as s from "../schema";
import { buildSeedData, DEFAULT_SEED } from "./build";
import { SYSTEM_USER_ID } from "./reference";

const CHUNK = 1_000;

async function insertChunked<T extends PgTable>(tx: Tx, table: T, rows: T["$inferInsert"][]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK));
  }
}

/**
 * Seeds one fictional hospital into an empty database, attributed to the system user.
 * Runs as whatever role `db` connects with; the app role is enough.
 */
export async function seedDatabase(db: Db, options: { today: IsoDate; seed?: number }) {
  const data = buildSeedData(options.today, options.seed ?? DEFAULT_SEED);
  const [systemUser, ...otherUsers] = data.users;
  if (systemUser.id !== SYSTEM_USER_ID) throw new Error("The system user must be inserted first");

  await withUser(db, SYSTEM_USER_ID, async (tx) => {
    // The audit trigger points every row at the system user, so it goes in before anything else.
    await insertChunked(tx, s.users, [systemUser]);
    await insertChunked(tx, s.departments, data.departments);
    await insertChunked(tx, s.users, otherUsers);
    await insertChunked(tx, s.sites, data.sites);
    await insertChunked(tx, s.buildings, data.buildings);
    await insertChunked(tx, s.floors, data.floors);
    await insertChunked(tx, s.rooms, data.rooms);
    await insertChunked(tx, s.testTemplates, data.testTemplates);
    await insertChunked(tx, s.testTemplateItems, data.testTemplateItems);
    await insertChunked(tx, s.deviceModels, data.deviceModels);
    await insertChunked(tx, s.assets, data.assets);
    await insertChunked(tx, s.ppmSchedules, data.ppmSchedules);
    await insertChunked(tx, s.workOrders, data.workOrders);
    await insertChunked(tx, s.testResults, data.testResults);
    await insertChunked(tx, s.partsUsed, data.partsUsed);
    await insertChunked(tx, s.locationEvents, data.locationEvents);
    await insertChunked(tx, s.libraryMovements, data.libraryMovements);
    await insertChunked(tx, s.incidents, data.incidents); // references come from the sequence: INC-00001…
    // Sequences carry on after the seeded rows: jobs from WO-000830, events after the last seeded id.
    await tx.execute(sql`select setval('work_order_number_seq', ${data.workOrders.length})`);
    await tx.execute(sql`select setval('location_events_id_seq', ${data.locationEvents.length})`);
    // End as the nightly job would leave things: today's EM scores, and job priorities that use them.
    // Stamped at the start of the seeded day, not by the wall clock, so a later run for that day finds its scores.
    await runDailyJobIn(tx, options.today, fromLondonLocal(`${options.today}T00:00`)!);
  });
}

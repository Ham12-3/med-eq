import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(url: string, options: postgres.Options<Record<string, never>> = {}) {
  const client = postgres(url, { max: 10, onnotice: () => {}, ...options });
  return { client, db: drizzle(client, { schema }) };
}

const cache = globalThis as unknown as { medassetDb?: ReturnType<typeof createDb> };

/** The app's shared connection, as the restricted medasset_app role. */
export function getDb(): Db {
  if (!cache.medassetDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cache.medassetDb = createDb(url);
  }
  return cache.medassetDb.db;
}

/**
 * Every write goes through here. It sets app.user_id for the transaction so the
 * audit trigger can attribute each change; writes without it are rejected.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

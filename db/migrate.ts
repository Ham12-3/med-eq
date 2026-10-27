import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "./client";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "db", "migrations");

/** Runs pending migrations. Needs the owner role, which can create triggers and grant. */
export async function migrateDatabase(ownerUrl: string): Promise<void> {
  const { client, db } = createDb(ownerUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

/**
 * Drops and recreates the schema, then migrates. Development and tests only:
 * this is the one path that removes data, and it needs the owner role.
 */
export async function resetDatabase(ownerUrl: string): Promise<void> {
  const client = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe("drop schema if exists drizzle cascade");
    await client.unsafe("drop schema if exists public cascade");
    await client.unsafe("create schema public");
  } finally {
    await client.end();
  }
  await migrateDatabase(ownerUrl);
}

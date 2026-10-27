import { existsSync } from "node:fs";
import { createDb } from "@/db/client";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** The test database is always seeded as if today were this date. */
export const TEST_TODAY = "2026-10-27";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  return value;
}

export const testAppUrl = () => env("TEST_DATABASE_URL");
export const testOwnerUrl = () => env("TEST_DATABASE_OWNER_URL");

/** Connection as the restricted app role. */
export const connectAsApp = () => createDb(testAppUrl(), { max: 2 });
/** Connection as the owner, to prove the triggers hold even without the grants. */
export const connectAsOwner = () => createDb(testOwnerUrl(), { max: 2 });

/** Thrown inside a transaction to roll it back on purpose. */
export class Rollback extends Error {}

export async function rolledBack(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

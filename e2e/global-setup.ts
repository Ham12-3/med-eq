import { createDb } from "@/db/client";
import { resetDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { todayInLondon } from "@/lib/dates";

/** A fresh seeded test database for every end-to-end run. */
export default async function globalSetup() {
  const owner = process.env.TEST_DATABASE_OWNER_URL;
  const app = process.env.TEST_DATABASE_URL;
  if (!owner || !app) throw new Error("TEST_DATABASE_URL and TEST_DATABASE_OWNER_URL must be set in .env.local");
  await resetDatabase(owner);
  const { client, db } = createDb(app, { max: 1 });
  try {
    // The app reads "today" from the clock, so seed for the real today.
    await seedDatabase(db, { today: todayInLondon() });
  } finally {
    await client.end();
  }
}

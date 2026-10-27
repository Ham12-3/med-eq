import { resetDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { connectAsApp, TEST_TODAY, testOwnerUrl } from "./helpers";

export default async function setup() {
  await resetDatabase(testOwnerUrl());
  const { client, db } = connectAsApp();
  try {
    await seedDatabase(db, { today: TEST_TODAY });
  } finally {
    await client.end();
  }
}

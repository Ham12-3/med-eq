import { expect, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";

/** A direct connection to the end-to-end test database, to set up and check results. */
export const { client, db } = createDb(process.env.TEST_DATABASE_URL!, { max: 2 });

export async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const [row] = await db.execute<Record<string, unknown>>(query);
  return row as T;
}

/** Signs in through the development picker and waits until `path` has loaded. */
export async function signIn(page: Page, user: { name: string }, path: string, heading: string | RegExp) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: new RegExp(user.name) }).click();
  // Check the pathname: a regex on the URL would also match /login?callbackUrl=<path>.
  const pathname = path.split("?")[0];
  await page.waitForURL((url) => url.pathname === pathname, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({ timeout: 30_000 });
}

export async function userWithRole(role: string) {
  return one<{ id: string; name: string }>(sql`select id, name from users where role = ${role} and active order by name limit 1`);
}

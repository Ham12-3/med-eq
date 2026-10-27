import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { barcode, installFakeCamera, show } from "./fake-camera";

const { client, db } = createDb(process.env.TEST_DATABASE_URL!, { max: 2 });
test.afterAll(() => client.end());

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const [row] = await db.execute<Record<string, unknown>>(query);
  return row as T;
}

async function signInAs(page: Page, role: string) {
  const user = await one<{ id: string; name: string }>(sql`select id, name from users where role = ${role} and active order by name limit 1`);
  await page.goto("/login?callbackUrl=/scan");
  await page.getByRole("button", { name: new RegExp(user.name) }).click();
  // Check the pathname: a regex on the URL would also match /login?callbackUrl=/scan.
  await page.waitForURL((url) => url.pathname === "/scan", { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Scan", level: 1 })).toBeVisible({ timeout: 30_000 });
  return user;
}

async function latestEvent(assetId: string) {
  return one<{ room: string; source: string; scanned_by_id: string }>(sql`
    select r.name as room, e.source, e.scanned_by_id from location_events e join rooms r on r.id = e.room_id
    where e.asset_id = ${assetId} order by e.occurred_at desc, e.id desc limit 1`);
}

test("scan a safe device then a room with the camera, and record where it is", async ({ page }) => {
  await installFakeCamera(page);
  const tech = await signInAs(page, "technician");
  const asset = await one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a join asset_status_on(current_date) s on s.asset_id = a.id
    where s.display_status = 'available' order by a.giai limit 1`);
  const room = await one<{ gln: string }>(sql`select gln from rooms where name = 'Theatre 2'`);

  await expect(page.getByTestId("scanner-video")).toBeVisible({ timeout: 30_000 });
  await show(page, barcode(`8004${asset.giai}`, "datamatrix")); // GS1 DataMatrix on the device
  const card = page.getByRole("region", { name: "Scanned device" });
  await expect(card).toContainText(asset.giai, { timeout: 15_000 });
  await expect(card).toContainText("Safe to use");

  await show(page, barcode(`(414)${room.gln}`, "qr")); // room label
  await expect(page.getByText(`Record ${asset.giai} as now in Theatre 2?`)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirm location" }).click();
  await expect(page.getByRole("status")).toContainText("now recorded in Theatre 2");

  expect(await latestEvent(asset.id)).toEqual({ room: "Theatre 2", source: "scan", scanned_by_id: tech.id });
});

test("warns that a device must not be used, and records a typed location as manual", async ({ page }) => {
  await installFakeCamera(page);
  await signInAs(page, "library");
  const asset = await one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a join asset_status_on(current_date) s on s.asset_id = a.id
    where 'PPM_OVERDUE' = any(s.reasons) order by a.giai limit 1`);
  const room = await one<{ gln: string }>(sql`select gln from rooms where name = 'EBME Workshop'`);

  await page.getByLabel("Or type the device code (GIAI)").fill(asset.giai.toLowerCase());
  await page.getByRole("button", { name: "Look up" }).click();
  const card = page.getByRole("region", { name: "Scanned device" });
  await expect(card).toContainText("Do not use this device");
  await expect(card).toContainText("PPM overdue");

  await page.getByLabel("Or type the room code (GLN)").fill(room.gln);
  await page.getByRole("button", { name: "Look up" }).click();
  await page.getByRole("button", { name: "Confirm location" }).click();
  await expect(page.getByRole("status")).toContainText("now recorded in EBME Workshop");

  const event = await latestEvent(asset.id);
  expect(event).toMatchObject({ room: "EBME Workshop", source: "manual" });
});

test("tells the user when a code is the wrong kind or unknown", async ({ page }) => {
  await installFakeCamera(page);
  await signInAs(page, "ward");
  const room = await one<{ gln: string }>(sql`select gln from rooms limit 1`);

  await page.getByLabel("Or type the device code (GIAI)").fill(room.gln);
  await page.getByRole("button", { name: "Look up" }).click();
  // Next's route announcer is also role="alert", so look for the message itself.
  await expect(page.getByText("That is a room label. Scan the device first.")).toBeVisible();

  await page.getByLabel("Or type the device code (GIAI)").fill("0299999XYZ999999");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("No device has the code 0299999XYZ999999.")).toBeVisible();

  await page.getByLabel("Or type the device code (GIAI)").fill("hello");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("That is not a MedAsset device or room barcode.")).toBeVisible();
});

test("falls back to typing when camera permission is refused", async ({ page }) => {
  await installFakeCamera(page, { deny: true });
  await signInAs(page, "technician");
  await expect(page.getByText("Camera permission was refused")).toBeVisible();
  await expect(page.getByLabel("Or type the device code (GIAI)")).toBeEnabled();
});

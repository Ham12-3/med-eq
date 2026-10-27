import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, one, signIn, userWithRole } from "./helpers";

/** A library device that is in the library, safe, and last checked in cleaned and charged. */
async function readyDevice() {
  return one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a
    join departments d on d.id = a.owner_department_id and d.code = 'LIB'
    join asset_current_location l on l.asset_id = a.id
    join rooms r on r.id = l.room_id and r.room_type = 'equipment_library'
    join asset_status_on(current_date) s on s.asset_id = a.id and not s.do_not_use
    join lateral (select * from library_movements m where m.asset_id = a.id order by m.occurred_at desc limit 1) lm
      on lm.direction = 'check_in' and lm.cleaned and lm.charged
    order by a.giai limit 1`);
}

test("checks a ready pump out to a ward and back in", async ({ page }) => {
  const librarian = await userWithRole("library");
  const device = await readyDevice();
  await signIn(page, librarian, "/library", "Equipment library");

  const desk = page.getByRole("region", { name: "Check out or in" });
  await desk.getByLabel("Scan or type the device code (GIAI)").fill(device.giai);
  await desk.getByRole("button", { name: "Find" }).click();
  const card = desk.getByRole("region", { name: "Library device" });
  await expect(card).toContainText("Ready");
  await card.getByLabel("Going to").selectOption({ label: "AMU Bay A" });
  await card.getByRole("button", { name: "Check out" }).click();
  await expect(desk.getByRole("status")).toHaveText("Checked out to AMU Bay A.");

  const out = await one<{ in_use: boolean; room: string; source: string }>(sql`
    select a.in_use, r.name as room, l.source from assets a
    join asset_current_location l on l.asset_id = a.id join rooms r on r.id = l.room_id where a.id = ${device.id}`);
  expect(out).toEqual({ in_use: true, room: "AMU Bay A", source: "manual" });

  // Back in, not yet charged: it then needs prep before it can go out again.
  await desk.getByLabel("Scan or type the device code (GIAI)").fill(device.giai);
  await desk.getByRole("button", { name: "Find" }).click();
  await expect(card).toContainText("Out on loan");
  await card.getByLabel("Cleaned").check();
  await card.getByRole("button", { name: "Check in" }).click();
  await expect(desk.getByRole("status")).toHaveText("Checked in: needs cleaning or charging.");

  const prepList = page.getByRole("region", { name: "Needs cleaning or charging" });
  const row = prepList.getByRole("listitem").filter({ hasText: device.giai });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Mark ready" }).click();
  await expect(prepList.getByRole("listitem").filter({ hasText: device.giai })).toHaveCount(0);
  expect(await one<{ in_use: boolean }>(sql`select in_use from assets where id = ${device.id}`)).toEqual({ in_use: false });
});

test("will not lend a device that must not be used", async ({ page }) => {
  const librarian = await userWithRole("library");
  const device = await readyDevice();
  // Make its PPM overdue, attributed to the system user like any other write.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true)`);
    await tx.execute(sql`update ppm_schedules set next_due_on = current_date - 1 where asset_id = ${device.id}`);
  });

  await signIn(page, librarian, "/library", "Equipment library");
  const desk = page.getByRole("region", { name: "Check out or in" });
  await desk.getByLabel("Scan or type the device code (GIAI)").fill(device.giai);
  await desk.getByRole("button", { name: "Find" }).click();
  const card = desk.getByRole("region", { name: "Library device" });
  await expect(card).toContainText("This device must not be used.");
  await expect(card.getByRole("button", { name: "Check out" })).toHaveCount(0);
});

test("ward staff cannot open the library", async ({ page }) => {
  await signIn(page, await userWithRole("ward"), "/ward", "Ward");
  await page.goto("/library");
  await expect(page).toHaveURL(/\/ward$/);
});

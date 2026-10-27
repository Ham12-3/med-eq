import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { one, signIn, userWithRole } from "./helpers";

async function waitForCanvas(page: Page) {
  await expect(page.getByTestId("floor-map").locator("canvas")).toBeVisible({ timeout: 60_000 });
}

/** Where a device's marker is on screen, from the map's development-only probe. */
async function markerOnScreen(page: Page, assetId: string) {
  await page.waitForFunction(() => typeof window.__medassetMarkerOnScreen === "function", undefined, { timeout: 30_000 });
  const point = await page.evaluate((id) => window.__medassetMarkerOnScreen!(id), assetId);
  if (!point) throw new Error(`Device ${assetId} is not on this floor's map`);
  return point;
}

test("the map shows the floor, a legend that matches the register, and selects a device", async ({ page }) => {
  await signIn(page, await userWithRole("technician"), "/map", "Map");
  await waitForCanvas(page);

  const ground = await one<{ dnu: number; total: number }>(sql`
    select count(*) filter (where s.display_status = 'do_not_use')::int as dnu, count(*)::int as total
    from asset_current_location l join rooms r on r.id = l.room_id join floors f on f.id = r.floor_id
    join buildings b on b.id = f.building_id and b.code = 'MAIN' join assets a on a.id = l.asset_id
    join asset_status_on(current_date) s on s.asset_id = a.id
    where f.level = 0 and a.lifecycle_status <> 'decommissioned'`);
  await expect(page.getByTestId("count-do_not_use")).toHaveText(String(ground.dnu));
  await expect(page.getByText(`${ground.total} devices in 16 rooms.`)).toBeVisible();

  // A device in a big room, so its marker is not hidden behind a neighbour.
  const device = await one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a join asset_current_location l on l.asset_id = a.id
    join rooms r on r.id = l.room_id and r.name = 'AMU Bay A'
    join asset_status_on(current_date) s on s.asset_id = a.id
    order by a.giai limit 1`);

  // Hovering shows a tooltip; clicking selects the device in the side panel.
  const point = await markerOnScreen(page, device.id);
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole("tooltip")).toContainText(device.giai);
  await page.mouse.click(point.x, point.y);
  const panel = page.getByRole("region", { name: "Selected device" });
  await expect(panel).toContainText(device.giai);
  await expect(panel.getByRole("link", { name: "Open device record" })).toHaveAttribute("href", `/assets/${device.id}`);

  // Clicking empty floor clears it.
  const box = (await page.getByTestId("floor-map").boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + 6);
  await expect(panel).toContainText("Click a device on the map");
});

test("switches floor and lists every device by room without the 3D view", async ({ page }) => {
  await signIn(page, await userWithRole("ward"), "/map", "Map");
  await page.getByRole("link", { name: /Outpatients Building, Ground floor/ }).click();
  await expect(page.getByRole("heading", { name: "List view: Outpatients Building, Ground floor" })).toBeVisible({ timeout: 30_000 });
  await waitForCanvas(page);

  const list = page.getByRole("region", { name: "Devices on this floor, by room" });
  await expect(list.locator("details")).toHaveCount(10);
  await list.locator("summary", { hasText: "Clinic Room 1" }).click();
  await expect(list.getByRole("link", { name: /^0299999/ }).first()).toBeVisible();
});

test("hiding a status in the legend leaves the counts and list alone", async ({ page }) => {
  await signIn(page, await userWithRole("manager"), "/map", "Map");
  await waitForCanvas(page);
  const before = await page.getByTestId("count-available").textContent();
  await page.getByRole("checkbox", { name: /Available/ }).uncheck();
  await expect(page.getByTestId("count-available")).toHaveText(before!);
  await expect(page.getByRole("checkbox", { name: /Available/ })).not.toBeChecked();
});

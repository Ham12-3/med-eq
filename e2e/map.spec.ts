import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { withUser } from "@/db/client";
import { loadActiveUser } from "@/lib/auth/users";
import { createNotice } from "@/lib/data/notices";
import { db, one, signIn, userWithRole } from "./helpers";

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
  // Every room is drawn from the Blender building (public/models/hospital.glb), not the placeholder.
  await expect.poll(() => page.evaluate(() => window.__medassetModelRooms?.() ?? 0), { timeout: 30_000 }).toBe(16);

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

test("clicking a device flies the camera to it, and Reset view shows the whole floor again", async ({ page }) => {
  await signIn(page, await userWithRole("technician"), "/map", "Map");
  await waitForCanvas(page);
  const device = await one<{ id: string }>(sql`
    select a.id from assets a join asset_current_location l on l.asset_id = a.id
    join rooms r on r.id = l.room_id and r.name = 'EBME Workshop' order by a.giai limit 1`);
  const box = (await page.getByTestId("floor-map").locator("canvas").boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const offCentre = async () => {
    const p = await markerOnScreen(page, device.id);
    return Math.hypot(p.x - centre.x, p.y - centre.y);
  };

  const before = await offCentre();
  const point = await markerOnScreen(page, device.id);
  await page.mouse.click(point.x, point.y);
  await expect.poll(offCentre, { timeout: 10_000 }).toBeLessThan(20); // now in the middle of the view
  expect(before).toBeGreaterThan(60);

  await page.getByRole("button", { name: "Reset view" }).click();
  await expect.poll(offCentre, { timeout: 10_000 }).toBeGreaterThan(60);
  await expect(page.getByRole("region", { name: "Selected device" })).toContainText("Click a device on the map");
});

test("filters by model and owner, carrying the filter across floors", async ({ page }) => {
  await signIn(page, await userWithRole("manager"), "/map", "Map");
  await page.getByLabel("Model").selectOption({ label: "Critical care ventilator CV-800" });
  await page.getByRole("button", { name: "Show" }).click();
  await page.waitForURL(/model=ventilator/, { timeout: 30_000 });

  const list = page.getByRole("region", { name: "Devices on this floor, by room" });
  await expect(list.getByRole("link", { name: /^0299999VEN/ }).first()).toBeVisible();
  await expect(list.getByRole("link", { name: /^0299999(?!VEN)/ })).toHaveCount(0);

  // Ventilators are mostly in critical care, on the first floor; the switcher shows each floor's count.
  const firstFloor = page.getByRole("link", { name: /Main Building, First floor/ });
  await firstFloor.click();
  await page.waitForURL((url) => url.searchParams.get("model") === "ventilator" && url.searchParams.has("floor"), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "List view: Main Building, First floor" })).toBeVisible();
  await expect(list.getByRole("link", { name: /^0299999VEN/ }).first()).toBeVisible();
});

test("Show recall highlights only the devices a safety notice matched", async ({ page }) => {
  // Log a notice through the app's own data layer, attributed to the MDSO.
  const admin = await userWithRole("admin");
  const mdso = (await loadActiveUser(db, admin.id))!;
  const model = await one<{ id: string }>(sql`select id from device_models where slug = 'defibrillator'`);
  const notice = await withUser(db, mdso.id, (tx) => createNotice(tx, mdso, {
    reference: "FSN/E2E/MAP", source: "fsn", title: "Charge circuit may fail", description: "Test notice for the map.",
    requiredAction: "Replace the charge board", issuedOn: "2026-10-01", deadline: "2030-01-31", quarantineRequired: true,
    criteria: [{ deviceModelId: model.id, serialFrom: null, serialTo: null, firmwareVersions: null }],
  }));

  await signIn(page, admin, "/map", "Map");
  await page.getByLabel("Show recall").selectOption({ label: "FSN/E2E/MAP: Charge circuit may fail" });
  await page.getByRole("button", { name: "Show" }).click();
  await page.waitForURL(/notice=/, { timeout: 30_000 });
  await waitForCanvas(page);

  await expect(page.getByTestId("recall-banner")).toContainText("Showing recall FSN/E2E/MAP");
  const list = page.getByRole("region", { name: "Devices on this floor, by room" });
  await expect(list.getByText("recall: waiting for action").first()).toBeVisible();
  await expect(list.getByRole("link", { name: /^0299999(?!DEF)/ })).toHaveCount(0);
  await expect(page.getByTestId("count-recalled")).not.toHaveText("0");

  const floors = page.getByRole("navigation", { name: "Floors" }).getByRole("link");
  const total = (await floors.allTextContents()).reduce((s, t) => s + Number(/\((\d+)\)/.exec(t)?.[1] ?? 0), 0);
  expect(total).toBe(notice.matched);
});

test("hiding a status in the legend leaves the counts and list alone", async ({ page }) => {
  await signIn(page, await userWithRole("manager"), "/map", "Map");
  await waitForCanvas(page);
  const before = await page.getByTestId("count-available").textContent();
  await page.getByRole("checkbox", { name: /Available/ }).uncheck();
  await expect(page.getByTestId("count-available")).toHaveText(before!);
  await expect(page.getByRole("checkbox", { name: /Available/ })).not.toBeChecked();
});

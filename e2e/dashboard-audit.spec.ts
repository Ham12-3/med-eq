import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { one, signIn, userWithRole } from "./helpers";

test("the manager's dashboard shows the numbers and opens the list behind each", async ({ page }) => {
  const manager = await userWithRole("manager");
  // The proxy sends a manager from "/" to the dashboard.
  await signIn(page, manager, "/dashboard", "Dashboard");

  const { overdue } = await one<{ overdue: number }>(sql`
    select count(*)::int as overdue from ppm_schedules p join assets a on a.id = p.asset_id
    join device_models m on m.id = a.device_model_id and not m.is_test_equipment
    where p.active and a.lifecycle_status <> 'decommissioned' and p.next_due_on < current_date`);
  await expect(page.getByTestId("tile-PPM overdue")).toHaveText(String(overdue));
  await expect(page.getByTestId("tile-PPM compliance")).toHaveText(/^\d+(\.\d)?%$/);
  await expect(page.getByRole("region", { name: "Technician workload" }).getByRole("row")).toHaveCount(6);

  await page.getByRole("link", { name: /^PPM overdue:/ }).click();
  await page.waitForURL((url) => url.pathname === "/assets" && url.searchParams.get("overdue") === "1", { timeout: 30_000 });
  await expect(page.getByText(`${overdue} assets`)).toBeVisible({ timeout: 30_000 });
});

test("the MDSO searches the audit log for a device and exports the evidence", async ({ page }) => {
  const admin = await userWithRole("admin");
  const device = await one<{ giai: string }>(sql`
    select a.giai from assets a where exists (select 1 from work_orders w where w.asset_id = a.id and w.status = 'completed')
    order by a.giai limit 1`);
  await signIn(page, admin, "/admin/audit", "Audit log");
  await page.getByLabel("Device (GIAI)").fill(device.giai.toLowerCase());
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(`Audit entries for device ${device.giai}.`)).toBeVisible({ timeout: 30_000 });
  const entries = page.getByRole("list", { name: "Audit entries" }).getByRole("listitem");
  await expect(entries.first()).toBeVisible();
  await expect(page.getByText(/Created device record/)).toBeVisible();

  const href = (await page.getByRole("link", { name: "Export CSV" }).getAttribute("href"))!;
  const csv = await page.request.get(href);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body.replace(/^﻿/, "").split("\r\n")[0]).toBe("Time (UK),User,Action,Record type,Record,Record id,Changes,Old value (JSON),New value (JSON)");
  expect(body).toContain(device.giai);
  expect(csv.headers()["x-content-sha256"]).toBe(createHash("sha256").update(body, "utf8").digest("hex"));

  const pdf = await page.request.get((await page.getByRole("link", { name: "Export PDF" }).getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.getByLabel("Device (GIAI)").fill("0299999XXX000000");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No device has the code 0299999XXX000000.")).toBeVisible();
});

test("only the admin role reaches the audit log", async ({ page }) => {
  await signIn(page, await userWithRole("manager"), "/dashboard", "Dashboard");
  await page.goto("/admin/audit");
  await expect(page).toHaveURL(/\/dashboard$/);
  const exported = await page.request.get("/admin/audit/export?format=csv", { maxRedirects: 0 });
  expect(exported.status()).toBe(307);
});

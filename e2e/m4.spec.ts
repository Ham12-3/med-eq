import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { one, signIn, userWithRole } from "./helpers";

test("the MDSO logs a safety notice, its devices are recalled, and a technician actions one", async ({ page }) => {
  const admin = await userWithRole("admin");
  await signIn(page, admin, "/notices/new", "Log a safety notice");

  await page.getByLabel("Reference").fill("FSN/E2E/0001");
  await page.getByLabel("Source").selectOption("fsn");
  await page.getByLabel("Title").fill("Lead-off detection may fail");
  await page.getByLabel("What is wrong").fill("Some recorders do not warn when a lead comes off.");
  await page.getByLabel("Required action").fill("Fit the replacement patient cable");
  await page.getByLabel("Action by").fill("2030-01-31");
  await page.getByLabel("Model").selectOption({ label: "12-lead ECG recorder EC-12" });
  await page.getByRole("button", { name: "Save and match devices" }).click();

  await page.waitForURL(/\/notices\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const matches = page.getByRole("region", { name: "Matched devices" });
  const { n } = await one<{ n: number }>(sql`
    select count(*)::int as n from assets a join device_models m on m.id = a.device_model_id
    where m.slug = 'ecg-machine' and a.lifecycle_status <> 'decommissioned'`);
  await expect(matches.getByRole("heading")).toHaveText(`Matched devices (${n})`);

  const first = matches.getByRole("row").nth(1);
  const jobNumber = (await first.getByRole("link", { name: /^WO-/ }).textContent())!;
  const device = await one<{ id: string; display_status: string }>(sql`
    select a.id, s.display_status from work_orders w join assets a on a.id = w.asset_id
    join asset_status_on(current_date) s on s.asset_id = a.id where w.number = ${jobNumber}`);
  expect(device.display_status).toBe("recalled");

  // A technician works the recall job.
  await page.context().clearCookies();
  await signIn(page, await userWithRole("technician"), "/work", "Jobs");
  await page.getByRole("region", { name: "Unassigned" }).getByRole("link", { name: new RegExp(jobNumber) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(jobNumber, { timeout: 30_000 });
  await expect(page.getByText("Required action: Fit the replacement patient cable")).toBeVisible();
  await page.getByRole("textbox", { name: "Action taken" }).fill("Replacement cable fitted and lead-off alarm tested");
  await page.getByRole("button", { name: "Save action" }).click();
  await expect(page.getByText("Action saved.")).toBeVisible();
  await page.getByRole("button", { name: "Close job" }).click();
  await expect(page.getByTestId("job-status")).toHaveText("Actioned");

  const after = await one<{ status: string; display_status: string }>(sql`
    select sm.status, s.display_status from safety_notice_matches sm
    join asset_status_on(current_date) s on s.asset_id = sm.asset_id where sm.asset_id = ${device.id}`);
  expect(after.status).toBe("actioned");
  expect(after.display_status).not.toBe("recalled");
});

test("the MDSO logs an incident and records the Yellow Card report", async ({ page }) => {
  const admin = await userWithRole("admin");
  const device = await one<{ giai: string }>(sql`select giai from assets order by giai limit 1`);
  await signIn(page, admin, "/incidents/new", "Log an incident");
  await page.getByLabel("When it happened (UK time)").fill("2026-10-20T14:30");
  await page.getByLabel("Harm").selectOption("low");
  await page.getByLabel("Device code (GIAI), if a device was involved").fill(device.giai);
  await page.getByLabel("What happened").fill("Pump alarm did not sound when the line was clamped.");
  await page.getByRole("button", { name: "Log incident" }).click();

  await page.waitForURL(/\/incidents\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INC-\d{5}$/);

  await page.getByLabel("Reported to the MHRA through the Yellow Card scheme").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Give the Yellow Card reference")).toBeVisible();
  await page.getByLabel("Yellow Card reference").fill("YC-654321");
  await page.getByLabel("Date reported").fill("2026-10-21");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
});

test("a manager downloads a report as CSV and PDF, and re-scores a model", async ({ page }) => {
  const manager = await userWithRole("manager");
  await signIn(page, manager, "/reports/overdue-ppm", "Overdue PPM");
  await expect(page.getByRole("row").nth(1)).toBeVisible();

  const csv = await page.request.get("/reports/overdue-ppm/export?format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).replace(/^﻿/, "").split("\r\n")[0]).toBe("Asset,Model,Owner,Last seen,Was due,Days overdue,Open job,Assigned to");
  const pdf = await page.request.get("/reports/overdue-ppm/export?format=pdf");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get("/reports/overdue-ppm/export?format=xls")).status()).toBe(400);

  const bed = await one<{ id: string }>(sql`select id from device_models where slug = 'hospital-bed'`);
  await page.goto(`/models/${bed.id}`);
  await page.getByLabel("Function").selectOption("8");
  await page.getByRole("button", { name: "Save and re-score" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved and re-scored.");
  const { n } = await one<{ n: number }>(sql`select count(*)::int as n from em_score_history where device_model_id = ${bed.id}`);
  expect(n).toBe(2);
});

test("ward staff cannot reach notices, incidents, models or reports", async ({ page }) => {
  await signIn(page, await userWithRole("ward"), "/ward", "Ward");
  for (const path of ["/notices", "/incidents", "/models", "/reports"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/ward$/);
  }
  // The proxy turns them away before the export runs (the route handler also checks for itself).
  const exported = await page.request.get("/reports/overdue-ppm/export?format=csv", { maxRedirects: 0 });
  expect(exported.status()).toBe(307);
  expect(exported.headers()["location"]).toMatch(/\/ward$/);
  expect(exported.headers()["content-type"] ?? "").not.toContain("text/csv");
});

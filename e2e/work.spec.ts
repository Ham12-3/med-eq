import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { one, signIn, userWithRole } from "./helpers";

type Item = { id: string; code: string; kind: "measurement" | "check"; lower: number | null; upper: number | null; required: boolean; group: string };

async function templateItems(jobId: string) {
  const { db } = await import("./helpers");
  return [...await db.execute<Item>(sql`
    select i.id, i.code, i.kind, i.lower_limit::float8 as lower, i.upper_limit::float8 as upper, i.required, i."group"
    from work_orders w join test_template_items i on i.template_id = w.test_template_id
    where w.id = ${jobId} order by i.position`)];
}

/** Fills the job's checklist through the UI. `failCode` gets an out-of-limits reading. */
async function completeChecklist(page: Page, jobId: string, failCode?: string) {
  const inspection = page.getByRole("region", { name: "1. Initial inspection" });
  await inspection.getByLabel("The device is clean").check();
  await inspection.getByLabel("The device has been decontaminated").check();
  await inspection.getByLabel("Control settings as found").fill("Ward defaults");
  await inspection.getByRole("button", { name: "Save inspection" }).click();
  await expect(inspection.getByText("Inspection saved.")).toBeVisible();

  const tests = page.getByRole("region", { name: "4. Performance and safety tests" });
  const analyser = tests.getByLabel("Test analyser used");
  if (await analyser.count()) {
    const value = await analyser.locator("option:not([disabled]):not([value=''])").first().getAttribute("value");
    await analyser.selectOption(value!);
  }
  for (const item of await templateItems(jobId)) {
    if (item.kind === "measurement") {
      const inside = item.lower !== null && item.upper !== null ? (item.lower + item.upper) / 2 : item.upper !== null ? item.upper / 2 : item.lower! * 1.2;
      const outside = item.upper !== null ? item.upper * 2 + 1 : item.lower! - 10;
      await tests.locator(`[name="m:${item.id}"]`).fill(String(item.code === failCode ? outside : inside));
    } else {
      await tests.locator(`[name="c:${item.id}"][value="pass"]`).check();
    }
  }
  await tests.getByRole("button", { name: "Save results" }).click();
  await expect(tests.getByText(/results saved\./)).toBeVisible();
}

async function deviceStatus(assetId: string) {
  return one<{ display_status: string; reasons: string[]; lifecycle_status: string }>(sql`
    select s.display_status, s.reasons, a.lifecycle_status from assets a
    join asset_status_on(current_date) s on s.asset_id = a.id where a.id = ${assetId}`);
}

test("a nurse reports a fault in two taps, and a technician repairs it", async ({ page }) => {
  const nurse = await one<{ id: string; name: string; dept: string }>(sql`
    select u.id, u.name, d.name as dept from users u join departments d on d.id = u.department_id
    where u.role = 'ward' and d.code = 'AMU'`);
  const device = await one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a
    join asset_current_location l on l.asset_id = a.id join rooms r on r.id = l.room_id
    join departments d on d.id = r.department_id and d.code = 'AMU'
    join asset_status_on(current_date) s on s.asset_id = a.id
    where s.display_status in ('available', 'in_use') order by a.giai limit 1`);

  // Tap 1: the device. Tap 2: what is wrong.
  await signIn(page, nurse, "/report-fault", "Report a fault");
  await page.getByLabel(`Or pick from devices last seen in ${nurse.dept}`).fill(device.giai);
  await page.getByRole("button", { name: new RegExp(device.giai) }).click();
  await page.getByRole("button", { name: "Alarm fault" }).click();
  const done = page.getByRole("status");
  await expect(done).toContainText("Do not use this device");
  const number = (await done.locator("strong.font-mono").textContent())!;
  expect(number).toMatch(/^WO-\d{6}$/);
  expect(await deviceStatus(device.id)).toMatchObject({ display_status: "do_not_use", reasons: ["FAULT_REPORTED"] });

  // A technician picks it up from the unassigned list and repairs it.
  const tech = await userWithRole("technician");
  await page.context().clearCookies();
  await signIn(page, tech, "/work", "Jobs");
  await page.getByRole("region", { name: "Unassigned" }).getByRole("link", { name: new RegExp(number) }).click();
  // The first visit compiles the job page on the dev server.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number, { timeout: 30_000 });
  await page.getByRole("button", { name: "Start job" }).click();
  // The Start button goes once the job is running; the header status is the feedback.
  await expect(page.getByTestId("job-status")).toHaveText("In progress");
  expect((await deviceStatus(device.id)).lifecycle_status).toBe("under_repair");

  const { id: jobId } = await one<{ id: string }>(sql`select id from work_orders where number = ${number}`);
  await completeChecklist(page, jobId);
  await page.getByRole("button", { name: "Close job" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number);
  await expect(page.getByTestId("job-status")).toHaveText("Returned to use");
  expect(await deviceStatus(device.id)).toMatchObject({ lifecycle_status: "in_service", reasons: [] });
});

test("a PPM closed with a failed test leaves the device Do not use and opens a repair", async ({ page }) => {
  const job = await one<{ id: string; number: string; assetId: string; assignee: string }>(sql`
    select w.id, w.number, w.asset_id as "assetId", u.name as assignee
    from work_orders w join users u on u.id = w.assignee_id
    join asset_status_on(current_date) s on s.asset_id = w.asset_id
    where w.type = 'ppm' and w.status = 'open' and not s.do_not_use and u.role = 'technician'
    order by w.number limit 1`);
  const failing = (await templateItems(job.id)).find((i) => i.kind === "measurement" && i.group === "electrical_safety")!;

  await signIn(page, { name: job.assignee }, `/work/${job.id}`, new RegExp(job.number));
  // Closing too early lists what is missing.
  await page.getByRole("button", { name: "Close job" }).click();
  await expect(page.getByText("This job cannot close yet:")).toBeVisible();

  await completeChecklist(page, job.id, failing.code);
  await page.getByRole("button", { name: "Close job" }).click();
  await expect(page.getByTestId("job-status")).toHaveText("Failed: device quarantined");

  const status = await deviceStatus(job.assetId);
  expect(status.lifecycle_status).toBe("quarantined");
  expect(status.display_status).toBe("do_not_use");
  expect(status.reasons).toEqual(expect.arrayContaining(["NOT_IN_SERVICE", "FAILED_TEST", "FAULT_REPORTED"]));

  // The device page says so too.
  await page.goto(`/assets/${job.assetId}`);
  await expect(page.getByRole("alert").filter({ hasText: "Do not use this device" })).toContainText("Failed safety or performance test");
});

test("ward staff cannot open the job queue", async ({ page }) => {
  const nurse = await userWithRole("ward");
  await signIn(page, nurse, "/ward", "Ward");
  await page.goto("/work");
  await expect(page).toHaveURL(/\/ward$/);
});

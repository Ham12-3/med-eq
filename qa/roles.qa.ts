// pnpm qa:roles: walks each role's top 5 tasks (PLAN.md section 1) in Chromium and saves a
// screenshot of every step to docs/qa/screens, for docs/qa.md (M6). It runs on the end-to-end
// server and its freshly seeded test database, so the writes it makes never reach development data.
// Each step records what it saw in docs/qa/results/<role>.json; a step that fails is recorded, not fatal.

import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { one, signIn, userWithRole } from "../e2e/helpers";

const SCREENS = "docs/qa/screens";
mkdirSync(SCREENS, { recursive: true });
mkdirSync("docs/qa/results", { recursive: true });
const results: Record<string, { task: string; screen: string; ok: boolean; note: string }[]> = {};
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");

/** Runs one task, saves a screenshot whatever happens, and records the outcome. */
async function task(page: Page, role: string, n: number, name: string, run: () => Promise<string | void>) {
  const screen = `${role}-${n}.png`;
  let ok = true;
  let note = "";
  try {
    note = (await run()) ?? "";
  } catch (error) {
    ok = false;
    note = (error instanceof Error ? error.message : String(error)).replace(ANSI, "").split("\n")[0].slice(0, 200);
  }
  await page.getByText(/^Loading/).first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {}); // streamed sections
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {}); // the dev-tools badge
  await page.screenshot({ path: `${SCREENS}/${screen}`, fullPage: true });
  (results[role] ??= []).push({ task: `${n}. ${name}`, screen, ok, note });
  // One file per role, written after every task, so a role that times out keeps what it did.
  writeFileSync(`docs/qa/results/${role}.json`, `${JSON.stringify(results[role], null, 2)}\n`);
}

/** Opens a page by URL and waits for its heading; a missing page shows Next's 404. */
async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({ timeout: 30_000 });
}

test.use({ viewport: { width: 1366, height: 900 }, actionTimeout: 30_000, navigationTimeout: 60_000 });
test.describe.configure({ timeout: 240_000 });

test("technician", async ({ page }) => {
  const tech = await userWithRole("technician");
  const role = "technician";
  await task(page, role, 1, "Work the job queue", async () => {
    await signIn(page, tech, "/work", "Jobs");
    const mine = page.getByRole("region", { name: "My jobs" });
    await expect(mine).toBeVisible({ timeout: 30_000 });
    return `${await mine.getByRole("listitem").count()} jobs in the queue`;
  });
  const device = await one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a join asset_status_on(current_date) s on s.asset_id = a.id
    where s.display_status = 'available' order by a.giai limit 1`);
  await task(page, role, 2, "Scan a device to open its record or job", async () => {
    await open(page, "/scan", "Scan");
    await page.getByLabel("Or type the device code (GIAI)").fill(device.giai);
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByRole("region", { name: "Scanned device" })).toContainText("Safe to use");
  });
  const job = await one<{ id: string; number: string }>(sql`
    select w.id, w.number from work_orders w join asset_status_on(current_date) s on s.asset_id = w.asset_id
    where w.type = 'ppm' and w.status = 'open' and w.assignee_id = ${tech.id} and not s.do_not_use order by w.number limit 1`);
  await task(page, role, 3, "Complete the PPM checklist", async () => {
    await open(page, `/work/${job.id}`, new RegExp(job.number));
    await page.getByRole("button", { name: "Start job" }).click();
    await expect(page.getByTestId("job-status")).toHaveText("In progress");
    const inspection = page.getByRole("region", { name: "1. Initial inspection" });
    await inspection.getByLabel("The device is clean").check();
    await inspection.getByLabel("The device has been decontaminated").check();
    await inspection.getByLabel("Control settings as found").fill("Ward defaults");
    await inspection.getByRole("button", { name: "Save inspection" }).click();
    await expect(inspection.getByText("Inspection saved.")).toBeVisible();
    const tests = page.getByRole("region", { name: "4. Performance and safety tests" });
    const analyser = tests.getByLabel("Test analyser used");
    if (await analyser.count()) {
      await analyser.selectOption((await analyser.locator("option:not([disabled]):not([value=''])").first().getAttribute("value"))!);
    }
    const items = await import("../e2e/helpers").then(({ db }) => db.execute<{ id: string; kind: string; lower: number | null; upper: number | null }>(sql`
      select i.id, i.kind, i.lower_limit::float8 as lower, i.upper_limit::float8 as upper
      from work_orders w join test_template_items i on i.template_id = w.test_template_id where w.id = ${job.id} order by i.position`));
    for (const i of items) {
      if (i.kind === "measurement") {
        const v = i.lower !== null && i.upper !== null ? (i.lower + i.upper) / 2 : i.upper !== null ? i.upper / 2 : i.lower! * 1.2;
        await tests.locator(`[name="m:${i.id}"]`).fill(String(v));
      } else {
        await tests.locator(`[name="c:${i.id}"][value="pass"]`).check();
      }
    }
    await tests.getByRole("button", { name: "Save results" }).click();
    await expect(tests.getByText(/results saved\./)).toBeVisible();
    return `${job.number}: ${items.length} tests recorded`;
  });
  await task(page, role, 4, "Close the job and print the SERVICED label", async () => {
    await page.getByRole("button", { name: "Close job" }).click();
    await expect(page.getByTestId("job-status")).toHaveText("Returned to use");
    const href = (await page.getByRole("link", { name: "Print SERVICED label" }).getAttribute("href"))!;
    const pdf = await page.request.get(href);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    return "Returned to use; label PDF downloads";
  });
  await task(page, role, 5, "Accept a new device into service", async () => {
    await open(page, "/assets/new", /Register|new device/i);
  });
});

test("manager", async ({ page }) => {
  const manager = await userWithRole("manager");
  const role = "manager";
  await task(page, role, 1, "See overdue PPM and compliance at a glance", async () => {
    await signIn(page, manager, "/dashboard", "Dashboard");
    return `Compliance ${await page.getByTestId("tile-PPM compliance").textContent()}, ${await page.getByTestId("tile-PPM overdue").textContent()} overdue`;
  });
  await task(page, role, 2, "Review failed tests from the last 90 days", async () => {
    await open(page, "/reports/failed-tests", /Failed tests/);
    return `${Math.max((await page.getByRole("row").count()) - 1, 0)} rows`;
  });
  await task(page, role, 3, "Run a recall search and track a notice to closure", async () => {
    await open(page, "/notices", /Safety notices/);
  });
  await task(page, role, 4, "Balance technician workload and reassign jobs", async () => {
    await open(page, "/work", "Jobs");
    const tech = page.getByLabel("Show the queue for");
    const options = await tech.locator("option").allTextContents();
    await tech.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Show" }).click();
    await page.waitForURL(/tech=/, { timeout: 30_000 });
    await page.getByRole("region", { name: /'s jobs/ }).getByRole("link", { name: /WO-\d+/ }).first().click();
    await expect(page.getByLabel("Assign to")).toBeVisible({ timeout: 30_000 });
    return `Queues: ${options.join(", ")}`;
  });
  await task(page, role, 5, "Export reports and review EM risk scores", async () => {
    const csv = await page.request.get("/reports/overdue-ppm/export?format=csv");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    await open(page, "/models", /Device models/);
    return "Overdue PPM CSV downloads";
  });
});

test("ward", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // ward staff mostly use a phone
  const nurse = await one<{ id: string; name: string; dept: string }>(sql`
    select u.id, u.name, d.name as dept from users u join departments d on d.id = u.department_id
    where u.role = 'ward' and d.code = 'AMU'`);
  const device = await one<{ id: string; giai: string }>(sql`
    select a.id, a.giai from assets a
    join asset_current_location l on l.asset_id = a.id join rooms r on r.id = l.room_id
    join departments d on d.id = r.department_id and d.code = 'AMU'
    join asset_status_on(current_date) s on s.asset_id = a.id
    where s.display_status = 'available' order by a.giai limit 1`);
  const role = "ward";
  await task(page, role, 1, "Report a fault in two taps", async () => {
    await signIn(page, nurse, "/report-fault", "Report a fault");
    await page.getByLabel(`Or pick from devices last seen in ${nurse.dept}`).fill(device.giai);
    await page.getByRole("button", { name: new RegExp(device.giai) }).click();
    await page.getByRole("button", { name: "Alarm fault" }).click();
    await expect(page.getByRole("status")).toContainText("Do not use this device");
  });
  await task(page, role, 2, "Find the nearest working device", async () => {
    await open(page, "/find", /nearest available/);
    await page.getByLabel("Device").selectOption({ index: 1 });
    await page.getByLabel("You are in").selectOption({ label: "AMU Bay A" });
    await page.getByRole("button", { name: "Find" }).click();
    await expect(page.getByRole("region", { name: "Nearest available" })).toBeVisible();
  });
  await task(page, role, 3, "Scan a device and check it is safe to use", async () => {
    await open(page, "/scan", "Scan");
    await page.getByLabel("Or type the device code (GIAI)").fill(device.giai);
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByRole("region", { name: "Scanned device" })).toContainText("Do not use this device"); // reported in task 1
  });
  await task(page, role, 4, "See which devices are on my ward", async () => {
    await open(page, "/ward", "Ward");
    const list = page.getByRole("region", { name: "Devices on this ward" });
    await list.locator("summary").first().click();
    await expect(list.getByRole("link").first()).toBeVisible();
    return (await list.getByRole("heading").textContent()) ?? "";
  });
  await task(page, role, 5, "Mark a device as in use or free", async () => {
    const free = await one<{ id: string }>(sql`
      select a.id from assets a join asset_current_location l on l.asset_id = a.id join rooms r on r.id = l.room_id
      join departments d on d.id = r.department_id and d.code = 'AMU'
      join asset_status_on(current_date) s on s.asset_id = a.id
      where s.display_status = 'available' and a.id <> ${device.id} order by a.giai limit 1`);
    await page.goto(`/assets/${free.id}`);
    await page.getByRole("button", { name: "In use" }).click();
    await expect(page.getByRole("button", { name: "Free" })).toBeVisible();
  });
});

test("library", async ({ page }) => {
  const librarian = await userWithRole("library");
  const role = "library";
  const ready = await one<{ giai: string }>(sql`
    select a.giai from assets a join departments d on d.id = a.owner_department_id and d.code = 'LIB'
    join asset_current_location l on l.asset_id = a.id join rooms r on r.id = l.room_id and r.room_type = 'equipment_library'
    join asset_status_on(current_date) s on s.asset_id = a.id and not s.do_not_use
    join lateral (select * from library_movements m where m.asset_id = a.id order by m.occurred_at desc limit 1) lm
      on lm.direction = 'check_in' and lm.cleaned and lm.charged
    order by a.giai limit 1`);
  const desk = page.getByRole("region", { name: "Check out or in" });
  const card = desk.getByRole("region", { name: "Library device" });
  await task(page, role, 1, "Check a device out to a ward", async () => {
    await signIn(page, librarian, "/library", "Equipment library");
    await desk.getByLabel("Scan or type the device code (GIAI)").fill(ready.giai);
    await desk.getByRole("button", { name: "Find" }).click();
    await card.getByLabel("Going to").selectOption({ label: "AMU Bay A" });
    await card.getByRole("button", { name: "Check out" }).click();
    await expect(desk.getByRole("status")).toHaveText("Checked out to AMU Bay A.");
  });
  await task(page, role, 2, "Check a device in, cleaned and charged", async () => {
    await desk.getByLabel("Scan or type the device code (GIAI)").fill(ready.giai);
    await desk.getByRole("button", { name: "Find" }).click();
    await card.getByLabel("Cleaned").check();
    await card.getByLabel("Charged").check();
    await card.getByRole("button", { name: "Check in" }).click();
    await expect(desk.getByRole("status")).toContainText("Checked in");
  });
  await task(page, role, 3, "See ready stock by model", async () => {
    const stock = page.getByRole("region", { name: "Stock by model" });
    await expect(stock).toBeVisible();
    await stock.scrollIntoViewIfNeeded();
  });
  await task(page, role, 4, "Chase devices out and overdue for return", async () => {
    const overdue = page.getByRole("region", { name: "On loan to chase" });
    await expect(overdue).toBeVisible();
    await overdue.scrollIntoViewIfNeeded();
    return `${(await overdue.getByRole("row").count()) - 1} loans to chase`;
  });
  await task(page, role, 5, "Send a faulty return to the workshop", async () => {
    const out = await one<{ id: string; giai: string }>(sql`
      select a.id, a.giai from assets a join departments d on d.id = a.owner_department_id and d.code = 'LIB'
      join lateral (select * from library_movements m where m.asset_id = a.id order by m.occurred_at desc limit 1) lm on lm.direction = 'check_out'
      join asset_status_on(current_date) s on s.asset_id = a.id and not s.do_not_use
      order by a.giai limit 1`);
    await desk.getByLabel("Scan or type the device code (GIAI)").fill(out.giai);
    await desk.getByRole("button", { name: "Find" }).click();
    await card.getByRole("link", { name: "Faulty? Report it" }).click();
    await expect(page.getByRole("heading", { name: "Report a fault", level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Alarm fault" }).click();
    await expect(page.getByRole("status")).toContainText("Do not use this device");
  });
});

test("admin", async ({ page }) => {
  const admin = await userWithRole("admin");
  const role = "admin";
  await task(page, role, 1, "Log an incident and flag a Yellow Card report", async () => {
    await signIn(page, admin, "/incidents/new", "Log an incident");
    await page.getByLabel("When it happened (UK time)").fill("2026-10-20T14:30");
    await page.getByLabel("Harm").selectOption("low");
    await page.getByLabel("What happened").fill("Pump alarm did not sound when the line was clamped.");
    await page.getByRole("button", { name: "Log incident" }).click();
    await page.waitForURL(/\/incidents\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await page.getByLabel("Reported to the MHRA through the Yellow Card scheme").check();
    await page.getByLabel("Yellow Card reference").fill("YC-QA-0001");
    await page.getByLabel("Date reported").fill("2026-10-21");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
  });
  await task(page, role, 2, "Log a safety notice and track matched devices", async () => {
    await open(page, "/notices/new", "Log a safety notice");
    await page.getByLabel("Reference").fill("FSN/QA/0001");
    await page.getByLabel("Source").selectOption("fsn");
    await page.getByLabel("Title").fill("Battery may not hold charge");
    await page.getByLabel("What is wrong").fill("Some units lose charge quickly.");
    await page.getByLabel("Required action").fill("Replace the battery pack");
    await page.getByLabel("Action by").fill("2030-01-31");
    await page.getByLabel("Model").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save and match devices" }).click();
    await page.waitForURL(/\/notices\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    return (await page.getByRole("region", { name: "Matched devices" }).getByRole("heading").textContent()) ?? "";
  });
  await task(page, role, 3, "Export audit evidence for a device", async () => {
    const device = await one<{ giai: string }>(sql`select giai from assets order by giai limit 1`);
    await open(page, "/admin/audit", "Audit log");
    await page.getByLabel("Device (GIAI)").fill(device.giai);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(`Audit entries for device ${device.giai}.`)).toBeVisible({ timeout: 30_000 });
    const csv = await page.request.get((await page.getByRole("link", { name: "Export CSV" }).getAttribute("href"))!);
    expect(csv.status()).toBe(200);
  });
  await task(page, role, 4, "Manage users and roles", async () => {
    await open(page, "/admin/users", /Users/);
  });
  await task(page, role, 5, "Manage reference data: models, rooms, templates", async () => {
    await open(page, "/models", /Device models/);
    return "Models only; no pages for rooms or test templates";
  });
});

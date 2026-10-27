// pnpm map:measure [--url=http://localhost:3200] [--floor=<id>]
// Measures the 3D map against PLAN.md M5 step 4: first view under 3 s, 60 fps while orbiting.
//
// Runs against a server you have already started (a production build: `pnpm build && pnpm start`),
// signs in through the development picker on the dev server's port if asked, and drives the real
// mouse. Headless Chromium has no GPU, so it uses software WebGL: its frame rate is a floor, not
// what a laptop sees. Pass --headed to watch, and read the real numbers from a GPU-backed browser.

import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string?]));
const url = args.url ?? "http://localhost:3200";
const signInUrl = args.signin ?? "http://localhost:3000"; // the dev server, whose picker sets a cookie localhost:3200 also sees
const headed = "headed" in args;
const runs = Number(args.runs ?? 3);

type Run = { ttfb: number; domReady: number; firstFrame: number; orbitFps: number; idleFps: number };

// Sent to the page as text: tsx adds helpers to compiled functions that do not exist in the browser.
// Counts frames for 1.5 s at rest, then for 3 s while dragging to orbit the camera.
const FPS_SCRIPT = `(async () => {
  const canvas = document.querySelector("[data-testid=floor-map] canvas");
  const r = canvas.getBoundingClientRect();
  const count = (ms) => new Promise((resolve) => {
    let frames = 0;
    const end = performance.now() + ms;
    const tick = () => { frames++; if (performance.now() < end) requestAnimationFrame(tick); else resolve(frames / (ms / 1000)); };
    requestAnimationFrame(tick);
  });
  const idle = await count(1500);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ev = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 }));
  ev("pointerdown", cx, cy);
  let x = cx, dir = 1;
  const mover = setInterval(() => { x += 6 * dir; if (Math.abs(x - cx) > r.width * 0.3) dir = -dir; ev("pointermove", x, cy + Math.sin(x / 40) * 20); }, 16);
  const orbit = await count(3000);
  clearInterval(mover);
  ev("pointerup", x, cy);
  return { idle, orbit };
})()`;

async function main() {
  const browser = await chromium.launch({ headless: !headed, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  // Sign in as a technician through the dev picker; the cookie is for "localhost", whatever the port.
  await page.goto(`${signInUrl}/login`);
  await page.getByRole("heading", { name: "Technician" }).locator("..").getByRole("button").first().click();
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 60_000 });

  const results: Run[] = [];
  for (let i = 0; i < runs; i++) {
    await page.goto("about:blank");
    const target = `${url}/map${args.floor ? `?floor=${args.floor}` : ""}`;
    await page.goto(target, { waitUntil: "load" });
    await page.waitForFunction(() => performance.getEntriesByName("medasset:map-first-frame").length > 0, undefined, { timeout: 60_000 });

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const first = performance.getEntriesByName("medasset:map-first-frame")[0];
      return { ttfb: nav.responseStart, domReady: nav.domContentLoadedEventEnd, firstFrame: first.startTime };
    });

    const fps = (await page.evaluate(FPS_SCRIPT)) as { idle: number; orbit: number };

    results.push({ ...timing, orbitFps: fps.orbit, idleFps: fps.idle });
  }
  const devices = /(\d+) devices in \d+ rooms/.exec(await page.locator("body").innerText())?.[1] ?? "?";
  await browser.close();

  const median = (k: keyof Run) => [...results].map((r) => r[k]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
  console.log(`Map performance at ${url}, ${devices} devices on the floor (${runs} runs, ${headed ? "headed" : "headless, software WebGL"}):`);
  console.table(results.map((r) => ({
    "TTFB ms": Math.round(r.ttfb), "DOM ready ms": Math.round(r.domReady), "first 3D frame ms": Math.round(r.firstFrame),
    "idle fps": Math.round(r.idleFps), "orbit fps": Math.round(r.orbitFps),
  })));
  const firstFrame = median("firstFrame");
  const orbit = median("orbitFps");
  console.log(`Median first 3D frame: ${Math.round(firstFrame)} ms (target under 3000) ${firstFrame < 3000 ? "PASS" : "FAIL"}`);
  console.log(`Median orbit frame rate: ${Math.round(orbit)} fps (target 60) ${orbit >= 55 ? "PASS" : headed ? "FAIL" : "software WebGL; check in a real browser"}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

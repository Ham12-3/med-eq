import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser, type Tx } from "@/db/client";
import { loadActiveUser, type CurrentUser } from "@/lib/auth/users";
import { getAssetSummary } from "@/lib/data/assets";
import { checkIn, checkOut, libraryDevice, libraryDevices, stockByModel } from "@/lib/data/library";
import { getLabelJob } from "@/lib/data/workOrders";
import { labelContent } from "@/lib/labels/content";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

async function librarian(): Promise<CurrentUser> {
  const [u] = await db.execute<{ id: string }>(sql`select id from users where role = 'library' order by name limit 1`);
  return (await loadActiveUser(db, u.id))!;
}

async function asLibrarian(fn: (tx: Tx, user: CurrentUser) => Promise<void>) {
  const user = await librarian();
  await rolledBack(() => withUser(db, user.id, async (tx) => {
    await fn(tx, user);
    throw new Rollback();
  }));
}

async function roomId(tx: Tx, name: string) {
  const [r] = await tx.execute<{ id: string }>(sql`select id from rooms where name = ${name}`);
  return r.id;
}

describe("seeded library history", () => {
  it("links every movement to a location event for the same device and room", async () => {
    const [{ movements, mismatched }] = await db.execute<{ movements: number; mismatched: number }>(sql`
      select count(*)::int as movements,
             count(*) filter (where e.asset_id <> m.asset_id or e.room_id <> m.room_id)::int as mismatched
      from library_movements m join location_events e on e.id = m.location_event_id`);
    expect(movements).toBeGreaterThan(100);
    expect(mismatched).toBe(0);
  });

  it("has ready stock, stock to prepare, and loans to chase", async () => {
    const devices = await libraryDevices(db, TEST_TODAY);
    expect(devices.length).toBeGreaterThan(140); // pumps and syringe drivers
    expect(devices.filter((d) => d.state === "ready").length).toBeGreaterThan(10);
    expect(devices.filter((d) => d.state === "needs_prep").length).toBeGreaterThan(0);
    expect(devices.filter((d) => d.loanOverdue).length).toBeGreaterThan(0);
    const stock = stockByModel(devices);
    expect(stock.reduce((n, s) => n + s.ready + s.needsPrep + s.onLoan + s.inWorkshop, 0)).toBe(devices.length);
  });

  it("does not list non-library stock", async () => {
    const [vent] = await db.execute<{ id: string }>(sql`select a.id from assets a join device_models m on m.id = a.device_model_id where m.slug = 'ventilator' limit 1`);
    expect(await libraryDevice(db, vent.id, TEST_TODAY)).toBeNull();
  });
});

describe("check out and check in", () => {
  it("lends a ready device, marks it in use, and records where it went", async () => {
    await asLibrarian(async (tx, user) => {
      const ready = (await libraryDevices(tx, TEST_TODAY)).find((d) => d.state === "ready" && !d.doNotUse)!;
      const ward = await roomId(tx, "AMU Bay A");
      expect(await checkOut(tx, user, { assetId: ready.id, roomId: ward, source: "scan", today: TEST_TODAY })).toBe("AMU Bay A");

      const after = (await libraryDevice(tx, ready.id, TEST_TODAY))!;
      expect(after).toMatchObject({ state: "out", roomName: "AMU Bay A", lastDirection: "check_out", outToDept: "Acute Medical Unit" });
      expect((await getAssetSummary(tx, ready.id, TEST_TODAY))!.inUse).toBe(true);

      const [m] = await tx.execute<{ by_user_id: string }>(sql`
        select by_user_id from library_movements where asset_id = ${ready.id} order by occurred_at desc limit 1`);
      expect(m.by_user_id).toBe(user.id);
    });
  });

  it("refuses to lend a device that is not ready, not in the library, or unsafe", async () => {
    await asLibrarian(async (tx, user) => {
      const devices = await libraryDevices(tx, TEST_TODAY);
      const ward = await roomId(tx, "AMU Bay A");
      const prep = devices.find((d) => d.state === "needs_prep")!;
      const out = devices.find((d) => d.state === "out" && !d.inWorkshop)!;
      await expect(checkOut(tx, user, { assetId: prep.id, roomId: ward, source: "scan", today: TEST_TODAY })).rejects.toThrow(/cleaned and charged/);
      await expect(checkOut(tx, user, { assetId: out.id, roomId: ward, source: "scan", today: TEST_TODAY })).rejects.toThrow(/Check it in first/);

      const ready = devices.find((d) => d.state === "ready")!;
      await tx.execute(sql`update ppm_schedules set next_due_on = ${TEST_TODAY}::date - 1 where asset_id = ${ready.id}`);
      await expect(checkOut(tx, user, { assetId: ready.id, roomId: ward, source: "scan", today: TEST_TODAY })).rejects.toThrow(/must not be used/);
      await expect(checkOut(tx, user, { assetId: devices.find((d) => d.state === "ready" && d.id !== ready.id)!.id, roomId: await roomId(tx, "EBME Workshop"), source: "scan", today: TEST_TODAY }))
        .rejects.toThrow(/ward or room/);
    });
  });

  it("takes a device back, needing prep until it is cleaned and charged", async () => {
    await asLibrarian(async (tx, user) => {
      const out = (await libraryDevices(tx, TEST_TODAY)).find((d) => d.state === "out" && !d.inWorkshop)!;
      expect(await checkIn(tx, user, { assetId: out.id, cleaned: true, charged: false, source: "manual", today: TEST_TODAY })).toBe("needs_prep");
      const back = (await libraryDevice(tx, out.id, TEST_TODAY))!;
      expect(back).toMatchObject({ state: "needs_prep", roomName: "Equipment Library" });
      expect((await getAssetSummary(tx, out.id, TEST_TODAY))!.inUse).toBe(false);

      expect(await checkIn(tx, user, { assetId: out.id, cleaned: true, charged: true, source: "manual", today: TEST_TODAY })).toBe("ready");
    });
  });

  it("leaves devices in the workshop to clinical engineering", async () => {
    await asLibrarian(async (tx, user) => {
      const inWorkshop = (await libraryDevices(tx, TEST_TODAY)).find((d) => d.inWorkshop)!;
      await expect(checkIn(tx, user, { assetId: inWorkshop.id, cleaned: true, charged: true, source: "scan", today: TEST_TODAY })).rejects.toThrow(/workshop/);
    });
  });
});

describe("label data", () => {
  it("builds a SERVICED label for a seeded job that returned a device to use", async () => {
    const [job] = await db.execute<{ id: string }>(sql`
      select w.id from work_orders w join ppm_schedules p on p.asset_id = w.asset_id and p.active
      where w.type = 'ppm' and w.outcome = 'returned_to_use' order by w.completed_at desc limit 1`);
    const label = labelContent((await getLabelJob(db, job.id))!);
    expect(label?.kind).toBe("serviced");
    expect(label?.lines.find(([k]) => k === "Next due")?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(label?.lines.find(([k]) => k === "By")?.[1]).toMatch(/^[A-Z]{2}$/);
  });
});

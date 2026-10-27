import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser, type Tx } from "@/db/client";
import { loadActiveUser, type CurrentUser } from "@/lib/auth/users";
import { addMonths } from "@/lib/dates";
import { registerDevice } from "@/lib/data/register";
import { createUser, updateUser } from "@/lib/data/users";
import { closeJob, JobError, listAnalysers, saveInspection, saveResults } from "@/lib/data/workOrders";
import { connectAsApp, Rollback, rolledBack, TEST_TODAY } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

async function userWithRole(role: string): Promise<CurrentUser> {
  const [u] = await db.execute<{ id: string }>(sql`select id from users where role = ${role} and active order by name limit 1`);
  return (await loadActiveUser(db, u.id))!;
}

async function first<T>(tx: Tx, query: ReturnType<typeof sql>) {
  const [row] = await tx.execute<Record<string, unknown>>(query);
  return row as T;
}

describe("registering a device", () => {
  it("books it into the workshop in acceptance, with an acceptance job, and gives the next number", async () => {
    const tech = await userWithRole("technician");
    await rolledBack(() => withUser(db, tech.id, async (tx) => {
      const pump = await first<{ id: string; dept: string; maxGiai: string }>(tx, sql`
        select m.id, (select id from departments where code = 'ICU') as dept,
               (select max(giai) from assets a where a.device_model_id = m.id) as "maxGiai"
        from device_models m where m.slug = 'volumetric-infusion-pump'`);
      const made = await registerDevice(tx, tech, {
        deviceModelId: pump.id, serialNumber: "QA-NEW-1", ownerDepartmentId: pump.dept, giai: null,
        acquisitionType: "purchased", purchaseDate: TEST_TODAY, firmwareVersion: "4.2",
      }, TEST_TODAY);

      const n = Number(pump.maxGiai.slice(-6)) + 1;
      expect(made.giai).toBe(`${pump.maxGiai.slice(0, -6)}${String(n).padStart(6, "0")}`);
      const state = await first<{ lifecycle: string; display: string; room: string; type: string; status: string; assignee: string; due: string }>(tx, sql`
        select a.lifecycle_status as lifecycle, s.display_status as display, r.room_type as room,
               w.type, w.status, w.assignee_id as assignee, w.due_on::text as due
        from assets a join asset_current_location l on l.asset_id = a.id join rooms r on r.id = l.room_id
        join asset_status_on(${TEST_TODAY}::date) s on s.asset_id = a.id
        join work_orders w on w.asset_id = a.id where a.id = ${made.assetId}`);
      expect(state).toEqual({ lifecycle: "acceptance", display: "do_not_use", room: "workshop", type: "acceptance", status: "open", assignee: tech.id, due: "2026-11-10" });
      // Audited as the technician.
      const audit = await first<{ n: number }>(tx, sql`
        select count(*)::int as n from audit_log where record_id = ${made.assetId}::text and user_id = ${tech.id}`);
      expect(audit.n).toBe(1);
      throw new Rollback();
    }));
  });

  it("refuses a code or serial that is already registered, and a code that is not ours", async () => {
    const tech = await userWithRole("technician");
    await rolledBack(() => withUser(db, tech.id, async (tx) => {
      const existing = await first<{ giai: string; model: string; serial: string; dept: string }>(tx, sql`
        select giai, device_model_id as model, serial_number as serial, owner_department_id as dept from assets order by giai limit 1`);
      const base = { deviceModelId: existing.model, ownerDepartmentId: existing.dept, acquisitionType: "purchased" as const, purchaseDate: null, firmwareVersion: null };
      await expect(registerDevice(tx, tech, { ...base, serialNumber: "QA-OTHER", giai: existing.giai.toLowerCase() }, TEST_TODAY))
        .rejects.toThrow(`${existing.giai} is already registered.`);
      await expect(registerDevice(tx, tech, { ...base, serialNumber: existing.serial, giai: null }, TEST_TODAY))
        .rejects.toThrow(/already registered as/);
      await expect(registerDevice(tx, tech, { ...base, serialNumber: "QA-OTHER", giai: "1234567ABC" }, TEST_TODAY))
        .rejects.toThrow(/not a MedAsset device code/);
      throw new Rollback();
    }));
  });

  it("goes into service with a PPM schedule once its acceptance job passes", async () => {
    const tech = await userWithRole("technician");
    await rolledBack(() => withUser(db, tech.id, async (tx) => {
      const model = await first<{ id: string; dept: string; interval: number }>(tx, sql`
        select m.id, (select id from departments where code = 'AMU') as dept, m.ppm_interval_months as interval
        from device_models m where m.slug = 'hospital-bed'`);
      const made = await registerDevice(tx, tech, {
        deviceModelId: model.id, serialNumber: "QA-BED-1", ownerDepartmentId: model.dept, giai: null,
        acquisitionType: "leased", purchaseDate: null, firmwareVersion: null,
      }, TEST_TODAY);
      // The acceptance job, done through the same functions the job page uses.
      await saveInspection(tx, made.jobId, tech, { inspection: { clean: true, decontaminated: true, controlSettings: "As delivered" }, calibrationNotes: null });
      const items = await tx.execute<{ id: string; kind: "measurement" | "check"; lower: number | null; upper: number | null }>(sql`
        select i.id, i.kind, i.lower_limit::float8 as lower, i.upper_limit::float8 as upper
        from work_orders w join test_template_items i on i.template_id = w.test_template_id where w.id = ${made.jobId}`);
      const analyser = (await listAnalysers(tx, TEST_TODAY)).find((a) => !a.doNotUse);
      await saveResults(tx, made.jobId, tech, items.map((i) => i.kind === "check"
        ? { itemId: i.id, kind: "check" as const, outcome: "pass" as const }
        : { itemId: i.id, kind: "measurement" as const, value: String(i.lower !== null && i.upper !== null ? (i.lower + i.upper) / 2 : i.upper !== null ? i.upper / 2 : i.lower! * 1.2) }),
      analyser?.id ?? null);
      await closeJob(tx, made.jobId, tech, { today: TEST_TODAY });
      const after = await first<{ lifecycle: string; accepted: boolean; next: string }>(tx, sql`
        select a.lifecycle_status as lifecycle, a.accepted_at is not null as accepted, p.next_due_on::text as next
        from assets a join ppm_schedules p on p.asset_id = a.id where a.id = ${made.assetId}`);
      expect(after).toEqual({ lifecycle: "in_service", accepted: true, next: addMonths(TEST_TODAY, model.interval) });
      throw new Rollback();
    }));
  });
});

describe("users and roles", () => {
  it("adds a user, changes their role, and makes them inactive, all audited", async () => {
    const admin = await userWithRole("admin");
    await rolledBack(() => withUser(db, admin.id, async (tx) => {
      const ward = await first<{ id: string }>(tx, sql`select id from departments where code = 'ED'`);
      const { id } = await createUser(tx, admin, { name: "Qa Tester", email: "QA.Tester@northbrook.example", role: "ward", departmentId: ward.id });
      await expect(createUser(tx, admin, { name: "Dup", email: "qa.tester@northbrook.example", role: "technician", departmentId: null }))
        .rejects.toThrow(/already has an account/);
      await expect(updateUser(tx, admin, id, { role: "ward", departmentId: null, active: true })).rejects.toThrow(/need a department/);
      expect(await updateUser(tx, admin, id, { role: "technician", departmentId: ward.id, active: false })).toEqual({ changed: true });

      const row = await first<{ email: string; initials: string; role: string; active: boolean }>(tx, sql`
        select email, initials, role, active from users where id = ${id}`);
      expect(row).toEqual({ email: "qa.tester@northbrook.example", initials: "QT", role: "technician", active: false });
      expect(await loadActiveUser(tx as never, id)).toBeNull(); // inactive users cannot sign in
      const audit = await first<{ n: number }>(tx, sql`select count(*)::int as n from audit_log where record_id = ${id}::text and user_id = ${admin.id}`);
      expect(audit.n).toBe(2);
      throw new Rollback();
    }));
  });

  it("will not let an admin lock themselves out or remove the last admin", async () => {
    const admin = await userWithRole("admin");
    await rolledBack(() => withUser(db, admin.id, async (tx) => {
      await expect(updateUser(tx, admin, admin.id, { role: "admin", departmentId: null, active: false })).rejects.toThrow(JobError);
      await expect(updateUser(tx, admin, admin.id, { role: "manager", departmentId: null, active: true })).rejects.toThrow(/own admin role/);
      // A second admin may be demoted only while another admin remains.
      const { id } = await createUser(tx, admin, { name: "Second Admin", email: "second.admin@northbrook.example", role: "admin", departmentId: null });
      expect(await updateUser(tx, admin, id, { role: "manager", departmentId: null, active: true })).toEqual({ changed: true });
      throw new Rollback();
    }));
  });
});

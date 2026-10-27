// Registering a new device (PLAN.md route /assets/new, technician task 5).
// The device starts in acceptance, in the EBME workshop, with an acceptance job from its model's
// test template. Closing that job (lib/rules/workOrder.ts) puts it into service and creates its
// PPM schedule, so nothing here needs a schedule.

import { sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { assets, locationEvents, workOrders } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/users";
import { addDays, type IsoDate } from "@/lib/dates";
import { COMPANY_PREFIX, isValidGiai, makeGiai } from "@/lib/gs1";
import { JobError } from "./workOrders";

type Reader = Db | Tx;

export const ACQUISITION_TYPES = ["purchased", "leased", "manufacturer_loan", "donated"] as const;
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number];

/** Days a new device's acceptance job is given before it shows as overdue. */
export const ACCEPTANCE_DAYS = 14;

export type RegisterOptions = Awaited<ReturnType<typeof registerOptions>>;

export async function registerOptions(db: Reader) {
  const [models, departments] = await Promise.all([
    db.execute<{ id: string; name: string; category: string }>(sql`
      select id, name, category from device_models order by name`),
    db.execute<{ id: string; name: string }>(sql`select id, name from departments order by name`),
  ]);
  return { models: [...models], departments: [...departments] };
}

export type NewDevice = {
  deviceModelId: string;
  serialNumber: string;
  ownerDepartmentId: string;
  giai: string | null; // null: give it the model's next number
  acquisitionType: AcquisitionType;
  purchaseDate: IsoDate | null;
  firmwareVersion: string | null;
};

/**
 * The model's code inside its GIAIs (0299999<code><6 digits>) and the next free number,
 * read from the devices already registered. Null when the model has no devices to copy from.
 */
async function nextGiai(tx: Tx, deviceModelId: string): Promise<string | null> {
  const [row] = await tx.execute<{ code: string | null; next: number | null }>(sql`
    select substring(giai from ${`^${COMPANY_PREFIX}([A-Z]+)[0-9]{6}$`}) as code,
           max(substring(giai from '([0-9]{6})$')::int) + 1 as next
    from assets where device_model_id = ${deviceModelId} and giai ~ ${`^${COMPANY_PREFIX}[A-Z]+[0-9]{6}$`}
    group by 1 order by count(*) desc limit 1`);
  if (!row?.code || !row.next) return null;
  return makeGiai(`${row.code}${String(row.next).padStart(6, "0")}`);
}

export async function registerDevice(tx: Tx, user: CurrentUser, input: NewDevice, today: IsoDate) {
  // One registration at a time, so two technicians cannot be handed the same next number.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('medasset:register-device'))`);

  const [model] = await tx.execute<{ id: string; templateId: string }>(sql`
    select id, test_template_id as "templateId" from device_models where id = ${input.deviceModelId}`);
  if (!model) throw new JobError("Choose the device model.");
  const [dept] = await tx.execute<{ id: string }>(sql`select id from departments where id = ${input.ownerDepartmentId}`);
  if (!dept) throw new JobError("Choose the owning department.");

  const giai = input.giai ? input.giai.toUpperCase() : await nextGiai(tx, model.id);
  if (!giai) throw new JobError("This model has no devices to number from yet. Type the code from the device's label.");
  if (!isValidGiai(giai) || !giai.startsWith(COMPANY_PREFIX)) throw new JobError(`${giai} is not a MedAsset device code. It starts ${COMPANY_PREFIX}, then letters and digits.`);

  const [taken] = await tx.execute<{ giai: string }>(sql`
    select giai from assets where giai = ${giai}
    union all
    select giai from assets where device_model_id = ${model.id} and serial_number = ${input.serialNumber}`);
  if (taken) {
    throw new JobError(taken.giai === giai
      ? `${giai} is already registered.`
      : `A device of this model with serial ${input.serialNumber} is already registered as ${taken.giai}.`);
  }

  const [workshop] = await tx.execute<{ id: string }>(sql`
    select id from rooms where room_type = 'workshop' and active order by name limit 1`);
  if (!workshop) throw new JobError("There is no workshop room to receive the device into.");

  const [asset] = await tx.insert(assets).values({
    giai, serialNumber: input.serialNumber, deviceModelId: model.id, ownerDepartmentId: dept.id,
    lifecycleStatus: "acceptance", acquisitionType: input.acquisitionType, purchaseDate: input.purchaseDate,
    firmwareVersion: input.firmwareVersion,
  }).returning({ id: assets.id });
  // Goods-in: the device arrives at the workshop for its acceptance checks.
  await tx.insert(locationEvents).values({
    assetId: asset.id, roomId: workshop.id, source: "manual", scannedById: user.id, occurredAt: new Date(),
  });
  const [job] = await tx.insert(workOrders).values({
    type: "acceptance", status: "open", priority: "normal", assetId: asset.id, testTemplateId: model.templateId,
    assigneeId: user.id, reportedById: user.id, dueOn: addDays(today, ACCEPTANCE_DAYS),
  }).returning({ id: workOrders.id, number: workOrders.number });

  return { assetId: asset.id, giai, jobId: job.id, jobNumber: job.number };
}

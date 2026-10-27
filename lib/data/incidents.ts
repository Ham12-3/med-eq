// The MDSO's incident log, with the Yellow Card (MHRA) reporting flag. PLAN.md M4 step 3.

import { eq, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { assets, incidents } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/users";
import { UUID } from "@/lib/data/assets";
import { JobError } from "@/lib/data/workOrders";
import type { HarmLevel, IncidentRow, IncidentStatus } from "@/lib/incidents";

type Reader = Db | Tx;

export * from "@/lib/incidents";

const SELECT = sql`
  select i.id, i.reference, to_char(i.occurred_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as "occurredAt",
         i.description, i.harm_level as "harmLevel", i.status, i.reported_to_mhra as "reportedToMhra",
         i.yellow_card_ref as "yellowCardRef",
         to_char(i.reported_to_mhra_at at time zone 'Europe/London', 'YYYY-MM-DD') as "reportedToMhraOn",
         a.id as "assetId", a.giai, m.name as "modelName", r.name as "roomName", u.name as "reportedBy"
  from incidents i
  join users u on u.id = i.reported_by_id
  left join assets a on a.id = i.asset_id
  left join device_models m on m.id = a.device_model_id
  left join rooms r on r.id = i.room_id`;

export async function listIncidents(db: Reader): Promise<IncidentRow[]> {
  return [...await db.execute<IncidentRow>(sql`${SELECT} order by i.status <> 'closed' desc, i.occurred_at desc`)];
}

export async function getIncident(db: Reader, id: string): Promise<IncidentRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.execute<IncidentRow>(sql`${SELECT} where i.id = ${id}`);
  return row ?? null;
}

export type NewIncident = {
  giai: string | null;
  roomId: string | null;
  occurredAt: Date;
  description: string;
  harmLevel: HarmLevel;
};

export async function createIncident(tx: Tx, user: CurrentUser, input: NewIncident) {
  if (input.occurredAt.getTime() > Date.now() + 5 * 60_000) throw new JobError("The incident cannot be in the future.");
  let assetId: string | null = null;
  if (input.giai) {
    const [asset] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.giai, input.giai.toUpperCase()));
    if (!asset) throw new JobError(`No device has the code ${input.giai}.`);
    assetId = asset.id;
  }
  const [row] = await tx.insert(incidents).values({
    assetId, roomId: input.roomId, occurredAt: input.occurredAt, description: input.description,
    harmLevel: input.harmLevel, reportedById: user.id,
  }).returning({ id: incidents.id, reference: incidents.reference });
  return row;
}

export type IncidentUpdate = {
  status: IncidentStatus;
  harmLevel: HarmLevel;
  reportedToMhra: boolean;
  yellowCardRef: string | null;
  reportedToMhraAt: Date | null;
};

/** Yellow Card reporting needs its reference and date; the database enforces the same rule. */
export async function updateIncident(tx: Tx, id: string, input: IncidentUpdate) {
  if (input.reportedToMhra && (!input.yellowCardRef || !input.reportedToMhraAt)) {
    throw new JobError("Give the Yellow Card reference and the date it was reported to the MHRA.");
  }
  const [row] = await tx.update(incidents).set({
    status: input.status, harmLevel: input.harmLevel, reportedToMhra: input.reportedToMhra,
    yellowCardRef: input.reportedToMhra ? input.yellowCardRef : null,
    reportedToMhraAt: input.reportedToMhra ? input.reportedToMhraAt : null,
  }).where(eq(incidents.id, id)).returning({ id: incidents.id });
  if (!row) throw new JobError("Unknown incident.");
}

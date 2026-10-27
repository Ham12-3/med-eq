"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { createIncident, HARM_LEVELS, INCIDENT_STATUSES, updateIncident } from "@/lib/data/incidents";
import { JobError } from "@/lib/data/workOrders";
import { atTime, fromLondonLocal, isIsoDate } from "@/lib/dates";

export type IncidentFormState = { error?: string; message?: string };

function friendly(error: unknown): IncidentFormState {
  if (error instanceof JobError || error instanceof NotPermittedError || error instanceof NotSignedInError) return { error: error.message };
  throw error;
}

const New = z.object({
  occurredAt: z.string().transform((v, ctx) => fromLondonLocal(v) ?? (ctx.addIssue({ code: "custom", message: "Enter when it happened" }), z.NEVER)),
  description: z.string().trim().min(5, "Describe what happened").max(4000),
  harmLevel: z.enum(HARM_LEVELS),
  giai: z.string().trim().max(30).transform((v) => v || null),
  roomId: z.string().transform((v) => (UUID.test(v) ? v : null)),
});

export async function createIncidentAction(_: IncidentFormState, formData: FormData): Promise<IncidentFormState> {
  const parsed = New.safeParse({
    occurredAt: formData.get("occurredAt") ?? "", description: formData.get("description") ?? "",
    harmLevel: formData.get("harmLevel") ?? "", giai: formData.get("giai") ?? "", roomId: formData.get("roomId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id: string;
  try {
    ({ id } = await authorizedWrite("incident.manage", (tx, user) => createIncident(tx, user, parsed.data)));
  } catch (error) {
    return friendly(error);
  }
  redirect(`/incidents/${id}`);
}

const Update = z.object({
  id: z.string().regex(UUID),
  status: z.enum(INCIDENT_STATUSES),
  harmLevel: z.enum(HARM_LEVELS),
  reportedToMhra: z.boolean(),
  yellowCardRef: z.string().trim().max(40).transform((v) => v || null),
  reportedToMhraOn: z.string().transform((v) => (isIsoDate(v) ? atTime(v, 12) : null)),
});

export async function updateIncidentAction(_: IncidentFormState, formData: FormData): Promise<IncidentFormState> {
  const parsed = Update.safeParse({
    id: formData.get("id"), status: formData.get("status"), harmLevel: formData.get("harmLevel"),
    reportedToMhra: formData.get("reportedToMhra") === "on", yellowCardRef: formData.get("yellowCardRef") ?? "",
    reportedToMhraOn: formData.get("reportedToMhraOn") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, reportedToMhraOn, ...rest } = parsed.data;
  try {
    await authorizedWrite("incident.manage", (tx) => updateIncident(tx, id, { ...rest, reportedToMhraAt: reportedToMhraOn }));
  } catch (error) {
    return friendly(error);
  }
  refresh();
  return { message: "Saved." };
}

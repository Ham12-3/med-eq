"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { ACQUISITION_TYPES, registerDevice } from "@/lib/data/register";
import { JobError } from "@/lib/data/workOrders";
import { isIsoDate, todayInLondon } from "@/lib/dates";

export type RegisterFormState = { error?: string };

const New = z.object({
  deviceModelId: z.string().regex(UUID, "Choose the device model"),
  serialNumber: z.string().trim().min(1, "Enter the serial number").max(60),
  ownerDepartmentId: z.string().regex(UUID, "Choose the owning department"),
  giai: z.string().trim().max(30).transform((v) => v || null),
  acquisitionType: z.enum(ACQUISITION_TYPES),
  purchaseDate: z.string().transform((v, ctx) => {
    if (!v) return null;
    if (!isIsoDate(v) || v > todayInLondon()) return (ctx.addIssue({ code: "custom", message: "The purchase date cannot be in the future" }), z.NEVER);
    return v;
  }),
  firmwareVersion: z.string().trim().max(40).transform((v) => v || null),
});

/** Registers the device, opens its acceptance job, and goes straight to the job. */
export async function registerDeviceAction(_: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  const field = (name: string) => formData.get(name) ?? "";
  const parsed = New.safeParse({
    deviceModelId: field("deviceModelId"), serialNumber: field("serialNumber"), ownerDepartmentId: field("ownerDepartmentId"),
    giai: field("giai"), acquisitionType: field("acquisitionType"), purchaseDate: field("purchaseDate"),
    firmwareVersion: field("firmwareVersion"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let jobId: string;
  try {
    ({ jobId } = await authorizedWrite("asset.register", (tx, user) => registerDevice(tx, user, parsed.data, todayInLondon())));
  } catch (error) {
    if (error instanceof JobError || error instanceof NotPermittedError || error instanceof NotSignedInError) return { error: error.message };
    throw error;
  }
  redirect(`/work/${jobId}`);
}

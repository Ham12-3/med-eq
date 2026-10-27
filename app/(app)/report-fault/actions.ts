"use server";

import { z } from "zod";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { reportFault, type FaultReport } from "@/lib/data/workOrders";

const Report = z.object({
  assetId: z.string().min(1),
  reason: z.string().trim().min(1, "Choose what is wrong").max(200),
});

export async function reportFaultAction(input: { assetId: string; reason: string }): Promise<FaultReport> {
  const parsed = Report.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    return await authorizedWrite("fault.report", (tx, user) => reportFault(tx, user, parsed.data.assetId, parsed.data.reason));
  } catch (error) {
    if (error instanceof NotPermittedError || error instanceof NotSignedInError) return { ok: false, message: error.message };
    throw error;
  }
}

"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { updateEmParts } from "@/lib/data/em";
import { todayInLondon } from "@/lib/dates";

const Parts = z.object({
  modelId: z.string().regex(UUID),
  fn: z.coerce.number().int().min(2).max(10),
  risk: z.coerce.number().int().min(1).max(5),
  maintenance: z.coerce.number().int().min(1).max(5),
});

export type EmFormState = { error?: string; message?: string };

export async function updateEmAction(_: EmFormState, formData: FormData): Promise<EmFormState> {
  const parsed = Parts.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a value for each part of the score." };
  const { modelId, ...parts } = parsed.data;
  try {
    await authorizedWrite("model.manage", (tx) => updateEmParts(tx, modelId, parts, todayInLondon()));
  } catch (error) {
    if (error instanceof NotPermittedError || error instanceof NotSignedInError) return { error: error.message };
    throw error;
  }
  refresh();
  return { message: "Saved and re-scored." };
}

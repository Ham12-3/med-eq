"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { authorizedWrite, getCurrentUser, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { checkIn, checkOut, libraryDeviceByGiai, type LibraryDevice } from "@/lib/data/library";
import { JobError } from "@/lib/data/workOrders";
import { todayInLondon } from "@/lib/dates";
import { parseScan } from "@/lib/gs1";
import { LIBRARY_STATE_TEXT } from "@/lib/rules/library";

export type LibraryLookup = { ok: true; device: LibraryDevice } | { ok: false; message: string };
export type LibraryResult = { ok: true; message: string } | { ok: false; message: string };

export async function lookupLibraryDevice(code: string): Promise<LibraryLookup> {
  const user = await getCurrentUser();
  if (!user || !can(user, "library.checkInOut")) return { ok: false, message: "Please sign in again." };
  const parsed = parseScan(String(code).slice(0, 200));
  if (!parsed || parsed.kind !== "giai") return { ok: false, message: "Scan or type the device's code (GIAI)." };
  const device = await libraryDeviceByGiai(getDb(), parsed.value, todayInLondon());
  if (!device) return { ok: false, message: `${parsed.value} is not library stock.` };
  return { ok: true, device };
}

async function write(fn: Parameters<typeof authorizedWrite<string>>[1]): Promise<LibraryResult> {
  try {
    const message = await authorizedWrite("library.checkInOut", fn);
    refresh();
    return { ok: true, message };
  } catch (error) {
    if (error instanceof JobError || error instanceof NotPermittedError || error instanceof NotSignedInError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

const Out = z.object({ assetId: z.string().regex(UUID), roomId: z.string().regex(UUID), source: z.enum(["scan", "manual"]) });

export async function checkOutAction(input: z.infer<typeof Out>): Promise<LibraryResult> {
  const parsed = Out.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose the device and where it is going." };
  return write(async (tx, user) => {
    const room = await checkOut(tx, user, { ...parsed.data, today: todayInLondon() });
    return `Checked out to ${room}.`;
  });
}

const In = z.object({ assetId: z.string().regex(UUID), cleaned: z.boolean(), charged: z.boolean(), source: z.enum(["scan", "manual"]) });

export async function checkInAction(input: z.infer<typeof In>): Promise<LibraryResult> {
  const parsed = In.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Scan the device again." };
  return write(async (tx, user) => {
    const state = await checkIn(tx, user, { ...parsed.data, today: todayInLondon() });
    return `Checked in: ${LIBRARY_STATE_TEXT[state].toLowerCase()}.`;
  });
}

/** One tap from the "needs cleaning or charging" list. */
export async function markReadyAction(formData: FormData): Promise<void> {
  const assetId = String(formData.get("assetId") ?? "");
  if (!UUID.test(assetId)) return;
  await write(async (tx, user) => {
    await checkIn(tx, user, { assetId, cleaned: true, charged: true, source: "manual", today: todayInLondon() });
    return "Ready.";
  });
}

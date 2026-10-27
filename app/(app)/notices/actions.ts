"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { closeNotice, createNotice, markNotAffected } from "@/lib/data/notices";
import { JobError } from "@/lib/data/workOrders";
import { isIsoDate } from "@/lib/dates";

const isoDate = z.string().refine(isIsoDate, "Enter a date");
const optional = z.string().trim().max(60).transform((s) => s || null);

const NoticeForm = z.object({
  reference: z.string().trim().min(3, "Enter the notice reference").max(60),
  source: z.enum(["natpsa", "mhra_dsi", "fsn"]),
  title: z.string().trim().min(3, "Enter a title").max(200),
  description: z.string().trim().min(3, "Describe the problem").max(4000),
  requiredAction: z.string().trim().min(3, "Enter the required action").max(1000),
  issuedOn: isoDate,
  deadline: isoDate,
  quarantineRequired: z.boolean(),
  criteria: z.array(z.object({
    deviceModelId: z.string().regex(UUID, "Choose a device model"),
    serialFrom: optional,
    serialTo: optional,
    firmware: z.string().max(400),
  })).min(1, "Add at least one affected device model").max(20),
});

export type NoticeFormInput = z.input<typeof NoticeForm>;
export type CreateNoticeResult = { ok: true; id: string; matched: number } | { ok: false; message: string };

async function guard<T>(fn: () => Promise<T>): Promise<T | { ok: false; message: string }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof JobError || error instanceof NotPermittedError || error instanceof NotSignedInError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function createNoticeAction(input: NoticeFormInput): Promise<CreateNoticeResult> {
  const parsed = NoticeForm.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { criteria, ...notice } = parsed.data;
  return guard(async () => {
    const result = await authorizedWrite("notice.manage", (tx, user) => createNotice(tx, user, {
      ...notice,
      criteria: criteria.map((c) => ({
        deviceModelId: c.deviceModelId, serialFrom: c.serialFrom, serialTo: c.serialTo,
        firmwareVersions: c.firmware.split(",").map((v) => v.trim()).filter(Boolean),
      })),
    }));
    return { ok: true as const, ...result };
  });
}

export type NoticeActionState = { error?: string };

export async function markNotAffectedAction(_: NoticeActionState, formData: FormData): Promise<NoticeActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it is not affected." };
  const result = await guard(async () => {
    await authorizedWrite("notice.manage", (tx, user) => markNotAffected(tx, user, String(formData.get("matchId") ?? ""), reason));
    return { ok: true as const };
  });
  if (!result.ok) return { error: result.message };
  refresh();
  return {};
}

export async function closeNoticeAction(_: NoticeActionState, formData: FormData): Promise<NoticeActionState> {
  const result = await guard(async () => {
    await authorizedWrite("notice.manage", (tx) => closeNotice(tx, String(formData.get("noticeId") ?? "")));
    return { ok: true as const };
  });
  if (!result.ok) return { error: result.message };
  refresh();
  return {};
}

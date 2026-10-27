"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ROLES } from "@/lib/auth/permissions";
import { authorizedWrite, NotPermittedError, NotSignedInError } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { createUser, updateUser } from "@/lib/data/users";
import { JobError } from "@/lib/data/workOrders";

export type UserFormState = { error?: string; message?: string };

function friendly(error: unknown): UserFormState {
  if (error instanceof JobError || error instanceof NotPermittedError || error instanceof NotSignedInError) return { error: error.message };
  throw error;
}

const department = z.string().transform((v) => (UUID.test(v) ? v : null));

const New = z.object({
  name: z.string().trim().min(2, "Enter their full name").max(80),
  email: z.string().trim().email("Enter a work email address").max(120),
  role: z.enum(ROLES),
  departmentId: department,
});

export async function createUserAction(_: UserFormState, formData: FormData): Promise<UserFormState> {
  const parsed = New.safeParse({
    name: formData.get("name") ?? "", email: formData.get("email") ?? "",
    role: formData.get("role") ?? "", departmentId: formData.get("departmentId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await authorizedWrite("user.manage", (tx, user) => createUser(tx, user, parsed.data));
  } catch (error) {
    return friendly(error);
  }
  refresh();
  return { message: `Added ${parsed.data.name}.` };
}

const Change = z.object({
  id: z.string().regex(UUID),
  role: z.enum(ROLES),
  departmentId: department,
  active: z.boolean(),
});

export async function updateUserAction(_: UserFormState, formData: FormData): Promise<UserFormState> {
  const parsed = Change.safeParse({
    id: formData.get("id"), role: formData.get("role"), departmentId: formData.get("departmentId") ?? "",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...change } = parsed.data;
  let changed: boolean;
  try {
    ({ changed } = await authorizedWrite("user.manage", (tx, user) => updateUser(tx, user, id, change)));
  } catch (error) {
    return friendly(error);
  }
  refresh();
  return { message: changed ? "Saved." : "No change." };
}

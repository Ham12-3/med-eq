// Rules for changing users at /admin/users. Pure, so they are unit-tested on their own.
// Users are never deleted: someone who leaves is made inactive, which signs them out at once
// because every request re-reads the user (lib/auth/users.ts).

import type { Role } from "./permissions";

export type UserState = { id: string; role: Role; active: boolean; departmentId: string | null };

/** Why a change may not be made, or null if it may. */
export function userChangeBlocker(input: {
  actorId: string;
  before: UserState | null; // null when adding a user
  after: Omit<UserState, "id">;
  /** Active admins other than this user. */
  otherActiveAdmins: number;
}): string | null {
  const { actorId, before, after, otherActiveAdmins } = input;
  if (after.role === "ward" && !after.departmentId) return "Ward staff need a department, so they see their own ward's devices.";
  if (!before) return null;
  const wasAdmin = before.role === "admin" && before.active;
  const staysAdmin = after.role === "admin" && after.active;
  if (before.id === actorId && !after.active) return "You cannot make yourself inactive.";
  if (before.id === actorId && wasAdmin && !staysAdmin) return "You cannot remove your own admin role. Ask another admin.";
  if (wasAdmin && !staysAdmin && otherActiveAdmins === 0) return "There must always be at least one active admin.";
  return null;
}

/** Initials from a full name: first letter of the first and last words. */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

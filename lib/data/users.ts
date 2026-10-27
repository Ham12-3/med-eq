// Users and roles for /admin/users (admin task 4). Every change goes through authorizedWrite,
// so the audit trigger records who changed whom; nothing is ever deleted.

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { departments, users } from "@/db/schema";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import type { Role } from "@/lib/auth/permissions";
import { initialsFor, userChangeBlocker } from "@/lib/auth/userAdmin";
import type { CurrentUser } from "@/lib/auth/users";
import { JobError } from "./workOrders";

type Reader = Db | Tx;

export type UserRow = {
  id: string; name: string; email: string; initials: string; role: Role;
  departmentId: string | null; departmentName: string | null; active: boolean;
};

export async function listUsers(db: Reader): Promise<UserRow[]> {
  return db
    .select({
      id: users.id, name: users.name, email: users.email, initials: users.initials, role: users.role,
      departmentId: users.departmentId, departmentName: departments.name, active: users.active,
    })
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(ne(users.id, SYSTEM_USER_ID))
    .orderBy(desc(users.active), asc(users.role), asc(users.name));
}

export async function departmentOptions(db: Reader) {
  return db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name));
}

async function otherActiveAdmins(tx: Tx, exceptId: string | null) {
  const [{ n }] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from users
    where role = 'admin' and active and id <> ${SYSTEM_USER_ID} and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)`);
  return n;
}

async function checkDepartment(tx: Tx, departmentId: string | null) {
  if (!departmentId) return;
  const [dept] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId));
  if (!dept) throw new JobError("Choose a department from the list.");
}

export type NewUser = { name: string; email: string; role: Role; departmentId: string | null };

export async function createUser(tx: Tx, actor: CurrentUser, input: NewUser) {
  // Serialise user changes, so the "at least one admin" count cannot race.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('medasset:users'))`);
  const blocker = userChangeBlocker({ actorId: actor.id, before: null, after: { ...input, active: true }, otherActiveAdmins: 0 });
  if (blocker) throw new JobError(blocker);
  await checkDepartment(tx, input.departmentId);
  const email = input.email.toLowerCase();
  const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) throw new JobError(`${email} already has an account.`);
  const [row] = await tx.insert(users).values({
    name: input.name, email, initials: initialsFor(input.name), role: input.role, departmentId: input.departmentId,
  }).returning({ id: users.id });
  return row;
}

export type UserChange = { role: Role; departmentId: string | null; active: boolean };

export async function updateUser(tx: Tx, actor: CurrentUser, id: string, change: UserChange) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('medasset:users'))`);
  if (id === SYSTEM_USER_ID) throw new JobError("The system user cannot be changed.");
  const [before] = await tx
    .select({ id: users.id, role: users.role, active: users.active, departmentId: users.departmentId })
    .from(users).where(eq(users.id, id)).for("update");
  if (!before) throw new JobError("That user does not exist.");
  const blocker = userChangeBlocker({ actorId: actor.id, before, after: change, otherActiveAdmins: await otherActiveAdmins(tx, id) });
  if (blocker) throw new JobError(blocker);
  await checkDepartment(tx, change.departmentId);
  if (before.role === change.role && before.active === change.active && before.departmentId === change.departmentId) return { changed: false };
  await tx.update(users).set(change).where(and(eq(users.id, id), ne(users.id, SYSTEM_USER_ID)));
  return { changed: true };
}

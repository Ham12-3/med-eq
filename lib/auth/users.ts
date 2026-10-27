import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { departments, users } from "@/db/schema";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import type { Role } from "./permissions";

/** The narrow view of a user that the app passes around. Never the raw row. */
export type CurrentUser = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  departmentName: string | null;
  active: true;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An active, real user by id, or null. Read fresh on every request so deactivation and role changes apply at once. */
export async function loadActiveUser(db: Db, id: string): Promise<CurrentUser | null> {
  if (!UUID.test(id) || id === SYSTEM_USER_ID) return null;
  const [row] = await db
    .select({
      id: users.id, name: users.name, initials: users.initials, email: users.email,
      role: users.role, departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(and(eq(users.id, id), eq(users.active, true)))
    .limit(1);
  return row ? { ...row, active: true } : null;
}

/** Active users for the development "sign in as" picker, by role then name. */
export async function listSignInUsers(db: Db) {
  return db
    .select({ id: users.id, name: users.name, role: users.role, departmentName: departments.name })
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(and(eq(users.active, true), ne(users.id, SYSTEM_USER_ID)))
    .orderBy(asc(users.role), asc(users.name));
}

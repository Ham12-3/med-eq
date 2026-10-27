import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import { listSignInUsers, loadActiveUser } from "@/lib/auth/users";
import { connectAsApp, Rollback, rolledBack } from "./helpers";

const { client, db } = connectAsApp();
afterAll(() => client.end());

describe("loadActiveUser", () => {
  it("returns the narrow view of an active user", async () => {
    const [tech] = await db.select().from(users).where(eq(users.role, "technician")).limit(1);
    const user = await loadActiveUser(db, tech.id);
    expect(user).toEqual({
      id: tech.id, name: tech.name, initials: tech.initials, email: tech.email,
      role: "technician", departmentName: "Clinical Engineering (EBME)", active: true,
    });
  });

  it("never signs in as the system user", async () => {
    expect(await loadActiveUser(db, SYSTEM_USER_ID)).toBeNull();
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await loadActiveUser(db, "00000000-0000-4000-8000-00000000ffff")).toBeNull();
    expect(await loadActiveUser(db, "not-a-uuid")).toBeNull();
    expect(await loadActiveUser(db, "")).toBeNull();
  });

  it("returns null as soon as a user is deactivated", async () => {
    const [nurse] = await db.select().from(users).where(eq(users.role, "ward")).limit(1);
    await rolledBack(() => withUser(db, SYSTEM_USER_ID, async (tx) => {
      await tx.update(users).set({ active: false }).where(eq(users.id, nurse.id));
      expect(await loadActiveUser(tx as unknown as typeof db, nurse.id)).toBeNull();
      throw new Rollback();
    }));
    expect(await loadActiveUser(db, nurse.id)).not.toBeNull();
  });
});

describe("listSignInUsers", () => {
  it("lists every active seeded user except the system user", async () => {
    const list = await listSignInUsers(db);
    expect(list).toHaveLength(14);
    expect(list.some((u) => u.id === SYSTEM_USER_ID)).toBe(false);
    expect(new Set(list.map((u) => u.role))).toEqual(new Set(["technician", "manager", "admin", "ward", "library"]));
  });
});

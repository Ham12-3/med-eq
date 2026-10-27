// The "never delete, never overwrite, always attributed" rules from CLAUDE.md,
// enforced by the database itself (db/migrations/0001_guarantees.sql).

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { assets, auditLog, departments } from "@/db/schema";
import { SYSTEM_USER_ID } from "@/db/seed/reference";
import { connectAsApp, connectAsOwner, Rollback, rolledBack } from "./helpers";

const app = connectAsApp();
const owner = connectAsOwner();

afterAll(async () => {
  await app.client.end();
  await owner.client.end();
});

/** Postgres error code from a drizzle/postgres.js rejection. */
async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
  throw new Error("Expected the statement to fail");
}

describe("database guarantees", () => {
  it("puts the audit and no-delete triggers on every table except audit_log", async () => {
    const rows = await owner.db.execute<{ table_name: string; triggers: string[] }>(sql`
      select c.relname as table_name,
             coalesce(array_agg(t.tgname order by t.tgname) filter (where t.tgname is not null), '{}') as triggers
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_trigger t on t.tgrelid = c.oid and not t.tgisinternal
      where n.nspname = 'public' and c.relkind = 'r'
      group by c.relname`);
    expect(rows.length).toBeGreaterThanOrEqual(22);
    for (const { table_name, triggers } of rows) {
      if (table_name === "audit_log") {
        expect(triggers).toEqual(["audit_log_append_only", "audit_log_no_truncate"]);
      } else {
        expect(triggers, table_name).toEqual(expect.arrayContaining(["audit_row", "forbid_delete", "forbid_truncate"]));
      }
    }
  });

  it("rejects a write that is not attributed to a user", async () => {
    const code = await errorCode(app.db.transaction((tx) => tx.insert(departments).values({ code: "TMP", name: "Temporary" })));
    expect(code).toBe("MA001");
  });

  it("writes an audit row with the user for every insert and update", async () => {
    await rolledBack(() => withUser(app.db, SYSTEM_USER_ID, async (tx) => {
      const [dept] = await tx.insert(departments).values({ code: "TMP", name: "Temporary" }).returning();
      await tx.update(departments).set({ name: "Renamed" }).where(eq(departments.id, dept.id));

      const rows = await tx.select().from(auditLog)
        .where(sql`${auditLog.tableName} = 'departments' and ${auditLog.recordId} = ${dept.id}`)
        .orderBy(auditLog.id);
      expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
      expect(rows.every((r) => r.userId === SYSTEM_USER_ID)).toBe(true);
      expect(rows[1].oldValue).toMatchObject({ name: "Temporary" });
      expect(rows[1].newValue).toMatchObject({ name: "Renamed" });
      throw new Rollback();
    }));
  });

  it("skips the audit row when an update changes nothing", async () => {
    await rolledBack(() => withUser(app.db, SYSTEM_USER_ID, async (tx) => {
      const [asset] = await tx.select().from(assets).limit(1);
      const before = await tx.select({ n: sql<number>`count(*)::int` }).from(auditLog);
      await tx.update(assets).set({ firmwareVersion: asset.firmwareVersion }).where(eq(assets.id, asset.id));
      const after = await tx.select({ n: sql<number>`count(*)::int` }).from(auditLog);
      expect(after[0].n).toBe(before[0].n);
      throw new Rollback();
    }));
  });

  it("bumps updated_at only when the row changes", async () => {
    await rolledBack(() => withUser(app.db, SYSTEM_USER_ID, async (tx) => {
      const [asset] = await tx.select().from(assets).limit(1);
      const [changed] = await tx.update(assets).set({ firmwareVersion: "9.9.9" }).where(eq(assets.id, asset.id)).returning();
      expect(changed.updatedAt.getTime()).toBeGreaterThan(asset.updatedAt.getTime());
      throw new Rollback();
    }));
  });

  it("refuses DELETE and TRUNCATE on domain tables, even for the owner", async () => {
    expect(await errorCode(owner.db.execute(sql`delete from assets`))).toBe("MA002");
    expect(await errorCode(owner.db.execute(sql`truncate assets cascade`))).toBe("MA002");
  });

  it("does not grant DELETE to the app role", async () => {
    // 42501 = insufficient_privilege: the grant stops it before the trigger does.
    expect(await errorCode(withUser(app.db, SYSTEM_USER_ID, (tx) => tx.delete(assets)))).toBe("42501");
  });

  it("keeps audit_log append-only, even for the owner", async () => {
    expect(await errorCode(owner.db.execute(sql`update audit_log set user_id = null`))).toBe("MA002");
    expect(await errorCode(owner.db.execute(sql`delete from audit_log`))).toBe("MA002");
    expect(await errorCode(owner.db.execute(sql`truncate audit_log`))).toBe("MA002");
    expect(await errorCode(app.db.execute(sql`update audit_log set user_id = null`))).toBe("42501");
  });

  it("serves current location from the index, without a sort", async () => {
    const [asset] = await app.db.select().from(assets).limit(1);
    const plan = await app.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute<{ "QUERY PLAN": string }>(sql`
        explain select * from asset_current_location where asset_id = ${asset.id}`);
    });
    const text = plan.map((row) => row["QUERY PLAN"]).join("\n");
    expect(text).toContain("le_asset_time_idx");
    expect(text).not.toMatch(/\bSort\b/);
  });
});

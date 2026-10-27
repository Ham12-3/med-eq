import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { departmentOptions, listUsers } from "@/lib/data/users";
import { NewUserForm, UserRowForm } from "./user-forms";

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Users and roles</h1>
        <p className="text-muted-foreground text-sm">
          A role decides what someone can see and do. Nobody is ever deleted: clear &ldquo;Can sign in&rdquo; when someone leaves,
          and they are signed out straight away. Every change is in the audit log.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Users />
      </Suspense>
    </main>
  );
}

async function Users() {
  const me = await requirePermission("user.manage");
  const db = getDb();
  const [users, departments] = await Promise.all([listUsers(db), departmentOptions(db)]);
  const active = users.filter((u) => u.active).length;
  return (
    <>
      <section aria-label="Add a user" className="flex flex-col gap-2">
        <h2 className="font-medium">Add a user</h2>
        <NewUserForm departments={departments} />
      </section>
      <section aria-label="Users" className="flex flex-col gap-2">
        <h2 className="font-medium">
          Users <span className="text-muted-foreground font-normal">({active} active, {users.length - active} inactive)</span>
        </h2>
        <ul className="flex flex-col divide-y rounded-lg border">
          {users.map((u) => <UserRowForm key={u.id} user={u} departments={departments} isSelf={u.id === me.id} />)}
        </ul>
      </section>
    </>
  );
}

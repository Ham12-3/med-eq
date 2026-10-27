"use client";

import { useActionState } from "react";
import { selectClass } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, ROLES } from "@/lib/auth/permissions";
import type { UserRow } from "@/lib/data/users";
import { createUserAction, updateUserAction, type UserFormState } from "./actions";

type Department = { id: string; name: string };

function Feedback({ state }: { state: UserFormState }) {
  return (
    <>
      {state.message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p>}
      {state.error && <p className="text-destructive text-sm" data-error>{state.error}</p>}
    </>
  );
}

function DepartmentSelect({ id, value, departments }: { id: string; value: string | null; departments: Department[] }) {
  return (
    <select id={id} name="departmentId" defaultValue={value ?? ""} className={selectClass}>
      <option value="">None</option>
      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );
}

function RoleSelect({ id, value }: { id: string; value: string }) {
  return (
    <select id={id} name="role" defaultValue={value} className={selectClass}>
      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}

/** One user's role, department and whether they can sign in. */
export function UserRowForm({ user, departments, isSelf }: { user: UserRow; departments: Department[]; isSelf: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(updateUserAction, {});
  return (
    <li aria-label={user.name} className={`flex flex-col gap-2 px-4 py-3 ${user.active ? "" : "bg-muted/40"}`}>
      {/* Keyed on the saved values: React resets a form after its action, and an unchanged key
          would reset the fields to the values first loaded, not the ones just saved. */}
      <form key={`${user.role}:${user.departmentId}:${user.active}`} action={action} className="grid items-end gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
        <input type="hidden" name="id" value={user.id} />
        <div className="min-w-0">
          <div className="font-medium">
            {user.name}{isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
            {!user.active && <span className="text-muted-foreground font-normal"> · inactive</span>}
          </div>
          <div className="text-muted-foreground truncate text-sm">{user.email} · {user.initials}</div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`role-${user.id}`} className="text-xs">Role</Label>
          <RoleSelect id={`role-${user.id}`} value={user.role} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`dept-${user.id}`} className="text-xs">Department</Label>
          <DepartmentSelect id={`dept-${user.id}`} value={user.departmentId} departments={departments} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={user.active} className="size-4" /> Can sign in
        </label>
        <Button type="submit" variant="outline" disabled={pending}>Save</Button>
      </form>
      <Feedback state={state} />
    </li>
  );
}

export function NewUserForm({ departments }: { departments: Department[] }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Add a user">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-name">Full name</Label>
          <Input id="new-name" name="name" required autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-email">Work email</Label>
          <Input id="new-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-role">Role</Label>
          <RoleSelect id="new-role" value="technician" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-dept">Department</Label>
          <DepartmentSelect id="new-dept" value={null} departments={departments} />
        </div>
      </div>
      <div><Button type="submit" disabled={pending}>Add user</Button></div>
      <Feedback state={state} />
    </form>
  );
}

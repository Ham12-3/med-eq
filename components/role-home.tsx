import { Suspense } from "react";
import { ROLE_LABEL, type Action } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

type RoleHomeProps = {
  action: Action;
  title: string;
  milestone: string;
  description: string;
};

/** Placeholder home screen for a role until its milestone in PLAN.md is built. */
export function RoleHome(props: RoleHomeProps) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <RoleHomeBody {...props} />
      </Suspense>
    </main>
  );
}

async function RoleHomeBody({ action, milestone, description }: RoleHomeProps) {
  const user = await requirePermission(action);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        Signed in as <strong>{user.name}</strong>, {ROLE_LABEL[user.role]}
        {user.departmentName ? `, ${user.departmentName}` : ""}.
      </p>
      <p className="text-muted-foreground">
        {description} This screen is built in milestone {milestone} of PLAN.md.
      </p>
    </div>
  );
}

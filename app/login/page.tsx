import Link from "next/link";
import { Suspense } from "react";
import { devSignInEnabled } from "@/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { landingPath, ROLE_LABEL, ROLES } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { listSignInUsers } from "@/lib/auth/users";
import { signInAs, signOutAction } from "./actions";

const ERRORS: Record<string, string> = {
  "unknown-user": "That user does not exist or has been deactivated.",
  disabled: "Development sign-in is turned off.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to MedAsset</h1>
        <p className="text-muted-foreground text-sm">Northbrook General Hospital (fictional). Synthetic data only.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading sign-in options…</p>}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SignInOptions({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const current = await getCurrentUser();

  return (
    <>
      {error && (
        <p role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {current && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-sm">
            You are signed in as <strong>{current.name}</strong> ({ROLE_LABEL[current.role]}).
          </p>
          <div className="flex gap-2">
            <Link href={landingPath(current.role, callbackUrl)} className={buttonVariants()}>Continue</Link>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">Sign out</Button>
            </form>
          </div>
        </section>
      )}

      {devSignInEnabled ? <DevSignIn callbackUrl={callbackUrl} /> : (
        <p className="text-muted-foreground text-sm">
          No sign-in method is configured. Set AUTH_DEV_LOGIN=true in .env.local for development.
        </p>
      )}
    </>
  );
}

async function DevSignIn({ callbackUrl }: { callbackUrl: string }) {
  const users = await listSignInUsers(getDb());
  return (
    <section className="flex flex-col gap-4" aria-labelledby="dev-sign-in">
      <div>
        <h2 id="dev-sign-in" className="font-medium">Development sign-in</h2>
        <p className="text-muted-foreground text-sm">Pick a seeded user to sign in as. There are no passwords in development.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((role) => {
          const ofRole = users.filter((u) => u.role === role);
          if (ofRole.length === 0) return null;
          return (
            <div key={role} className="flex flex-col gap-2 rounded-lg border p-4">
              <h3 className="text-sm font-medium">{ROLE_LABEL[role]}</h3>
              <ul className="flex flex-col gap-2">
                {ofRole.map((u) => (
                  <li key={u.id}>
                    <form action={signInAs}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="callbackUrl" value={callbackUrl} />
                      <Button type="submit" variant="outline" className="h-auto w-full justify-start py-2 text-left">
                        <span className="flex flex-col">
                          <span>{u.name}</span>
                          {u.departmentName && <span className="text-muted-foreground text-xs font-normal">{u.departmentName}</span>}
                        </span>
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

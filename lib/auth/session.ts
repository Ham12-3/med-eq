// The data access layer for "who is this and what may they do".
// The proxy only makes a quick check from the cookie; everything here re-checks
// the user against the database, so it is the real line of defence.

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/auth";
import { getDb, withUser, type Tx } from "@/db/client";
import { can, ROLE_HOME, type Action } from "./permissions";
import { loadActiveUser, type CurrentUser } from "./users";

/** The signed-in, still-active user, or null. Read once per render. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Stop any prerender here: Auth.js and the Postgres handshake use random bytes,
  // which Cache Components refuses during prerendering.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  return id ? loadActiveUser(getDb(), id) : null;
});

/** For pages: the current user, or off to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: the current user if they may do `action`, otherwise back to their own home. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, action)) redirect(ROLE_HOME[user.role]);
  return user;
}

export class NotSignedInError extends Error {
  constructor() {
    super("You need to sign in again.");
  }
}

export class NotPermittedError extends Error {
  constructor(action: Action) {
    super(`Your role is not allowed to do this (${action}).`);
  }
}

/**
 * Every server action that writes goes through here: it checks the session and the
 * permission itself, never trusting the page that called it, then runs `fn` in a
 * transaction attributed to the user for the audit log.
 */
export async function authorizedWrite<T>(
  action: Action,
  fn: (tx: Tx, user: CurrentUser) => Promise<T>,
): Promise<T> {
  const user = await getCurrentUser();
  if (!user) throw new NotSignedInError();
  if (!can(user, action)) throw new NotPermittedError(action);
  return withUser(getDb(), user.id, (tx) => fn(tx, user));
}

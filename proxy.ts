// Optimistic checks only: reads the session cookie, never the database.
// Pages and server actions re-check through lib/auth/session.ts.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { can, isRole, requiredAction, ROLE_HOME } from "@/lib/auth/permissions";

export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const role = isRole(req.auth?.user?.role) ? req.auth.user.role : null;

  // Always reachable, even with a stale cookie, so a deactivated user is never stuck in a loop.
  if (pathname === "/login") return NextResponse.next();

  if (!role) {
    const login = new URL("/login", req.nextUrl);
    if (pathname !== "/") login.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(login);
  }

  if (pathname === "/") return NextResponse.redirect(new URL(ROLE_HOME[role], req.nextUrl));

  const action = requiredAction(pathname);
  if (action && !can({ role, active: true }, action)) {
    return NextResponse.redirect(new URL(ROLE_HOME[role], req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  // Everything except Auth.js's own routes, Next internals and static files.
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|ktx2|wasm)$).*)"],
};

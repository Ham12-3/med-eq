import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/db/client";
import { isRole, type Role } from "@/lib/auth/permissions";
import { loadActiveUser } from "@/lib/auth/users";

declare module "next-auth" {
  interface User {
    role?: Role;
  }
  interface Session {
    user: { id: string; name: string; email: string; role: Role };
  }
}

/**
 * "Sign in as" any seeded user, with no password. Development only: it needs
 * AUTH_DEV_LOGIN=true and is always off in production builds. A real identity
 * provider (for example Microsoft Entra ID) is added alongside it before any pilot.
 */
export const devSignInEnabled =
  process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // one long shift
  pages: { signIn: "/login" },
  providers: devSignInEnabled
    ? [
        Credentials({
          id: "dev",
          name: "Development sign-in",
          credentials: { userId: {} },
          async authorize(credentials) {
            const userId = typeof credentials.userId === "string" ? credentials.userId : "";
            const user = await loadActiveUser(getDb(), userId);
            return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
          },
        }),
      ]
    : [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (isRole(token.role)) session.user.role = token.role;
      return session;
    },
  },
});

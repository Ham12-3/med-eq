"use server";

import { redirect } from "next/navigation";
import { devSignInEnabled, signIn, signOut } from "@/auth";
import { getDb } from "@/db/client";
import { landingPath } from "@/lib/auth/permissions";
import { loadActiveUser } from "@/lib/auth/users";

export async function signInAs(formData: FormData) {
  if (!devSignInEnabled) redirect("/login?error=disabled");
  const userId = String(formData.get("userId") ?? "");
  const user = await loadActiveUser(getDb(), userId);
  if (!user) redirect("/login?error=unknown-user");
  await signIn("dev", {
    userId: user.id,
    redirectTo: landingPath(user.role, String(formData.get("callbackUrl") ?? "")),
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

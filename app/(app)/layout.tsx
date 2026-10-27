import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { can, ROLE_LABEL, type Action } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "../login/actions";

// Shell for every signed-in page. The header streams in behind Suspense so the
// session read never holds up the page (Cache Components rule).

const NAV: { href: string; label: string; action: Action }[] = [
  { href: "/work", label: "Jobs", action: "workorder.viewQueue" },
  { href: "/dashboard", label: "Dashboard", action: "report.view" },
  { href: "/ward", label: "Ward", action: "fault.report" },
  { href: "/library", label: "Library", action: "library.checkInOut" },
  { href: "/notices", label: "Safety notices", action: "notice.manage" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">MedAsset</Link>
          <Suspense fallback={<div className="h-8 flex-1" />}>
            <UserNav />
          </Suspense>
        </div>
      </header>
      {children}
    </div>
  );
}

async function UserNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const links = NAV.filter((item) => can(user, item.action));
  return (
    <>
      <nav aria-label="Main" className="flex flex-1 flex-wrap gap-4 text-sm">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <span>
          {user.name} <span className="text-muted-foreground">· {ROLE_LABEL[user.role]}</span>
        </span>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">Sign out</Button>
        </form>
      </div>
    </>
  );
}

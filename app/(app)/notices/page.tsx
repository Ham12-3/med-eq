import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { listNotices, SOURCE_TEXT } from "@/lib/data/notices";
import { todayInLondon } from "@/lib/dates";

export default function NoticesPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Safety notices</h1>
        <Link href="/notices/new" className={buttonVariants()}>Log a notice</Link>
      </div>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Notices />
      </Suspense>
    </main>
  );
}

async function Notices() {
  await requirePermission("notice.manage");
  const notices = await listNotices(getDb(), todayInLondon());
  if (notices.length === 0) {
    return <p className="text-muted-foreground text-sm">No safety notices logged yet. Log one to find every affected device and open recall jobs.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Notice</TableHead><TableHead>Source</TableHead><TableHead>Deadline</TableHead><TableHead>Devices</TableHead><TableHead>Status</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {notices.map((n) => (
          <TableRow key={n.id}>
            <TableCell>
              <Link href={`/notices/${n.id}`} className="font-mono text-sm font-medium underline-offset-4 hover:underline">{n.reference}</Link>
              <span className="block">{n.title}</span>
            </TableCell>
            <TableCell className="text-sm">{SOURCE_TEXT[n.source]}{n.quarantineRequired ? " · quarantine" : ""}</TableCell>
            <TableCell className={n.overdue ? "font-medium text-red-700 dark:text-red-400" : ""}>{n.deadline}{n.overdue ? " (passed)" : ""}</TableCell>
            <TableCell>{n.matched - n.waiting} of {n.matched} done</TableCell>
            <TableCell className="capitalize">{n.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

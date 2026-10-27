import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { dashboardNumbers, technicianWorkload } from "@/lib/data/dashboard";
import { todayInLondon } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  await requirePermission("report.view");
  const db = getDb();
  const today = todayInLondon();
  const [n, workload] = await Promise.all([dashboardNumbers(db, today), technicianWorkload(db, today)]);

  return (
    <>
      <p className="text-muted-foreground text-sm">As of {today}. Each number opens the list behind it.</p>
      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/reports/ppm-compliance" label="PPM compliance" value={n.compliance === null ? "–" : `${n.compliance}%`}
          detail={`${n.inDate} of ${n.schedules} schedules in date`} alert={n.compliance !== null && n.compliance < 95} />
        <Tile href="/assets?overdue=1" label="PPM overdue" value={n.overduePpm}
          detail="Devices past their PPM date" alert={n.overduePpm > 0} />
        <Tile href="/assets?status=do_not_use&status=recalled" label="Do not use" value={n.doNotUse}
          detail={n.recalled ? `${n.recalled} of them recalled by a safety notice` : "Overdue, failed, faulty or out of service"} alert={n.doNotUse > 0} />
        <Tile href="/reports/failed-tests" label="Failed tests, 90 days" value={n.failedTests90}
          detail="Safety and performance tests that failed" alert={n.failedTests90 > 0} />
        <Tile href="/notices" label="Open safety notices" value={n.openNotices}
          detail={`${n.devicesAwaitingNotice} ${n.devicesAwaitingNotice === 1 ? "device" : "devices"} still waiting for action`} alert={n.devicesAwaitingNotice > 0} />
        <Tile href="/reports/mean-time-to-repair" label="Mean time to repair" value={n.mttrDays === null ? "–" : `${n.mttrDays} days`}
          detail={`Across ${n.repairs90} repairs closed in 90 days`} />
      </section>

      <section aria-label="Technician workload" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Technician workload</h2>
          <Link href="/work" className="text-sm underline underline-offset-4">
            {n.unassignedJobs} unassigned {n.unassignedJobs === 1 ? "job" : "jobs"} waiting
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Technician</TableHead><TableHead>Open jobs</TableHead><TableHead>Overdue</TableHead><TableHead>Critical or high</TableHead><TableHead>Awaiting parts</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {workload.map((w) => (
              <TableRow key={w.id}>
                <TableCell><Link href={`/work?tech=${w.id}`} className="underline-offset-4 hover:underline">{w.name}</Link></TableCell>
                <TableCell className="font-medium">{w.open}</TableCell>
                <TableCell className={w.overdue ? "text-red-700 dark:text-red-400" : ""}>{w.overdue}</TableCell>
                <TableCell>{w.urgent}</TableCell>
                <TableCell>{w.awaitingParts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function Tile({ href, label, value, detail, alert }: { href: string; label: string; value: ReactNode; detail: string; alert?: boolean }) {
  return (
    <Link href={href} aria-label={`${label}: ${value}. ${detail}`}
      className={cn("hover:bg-muted flex flex-col gap-1 rounded-xl border p-5", alert && "border-red-300 dark:border-red-900")}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={cn("text-3xl font-semibold tabular-nums", alert && "text-red-700 dark:text-red-400")} data-testid={`tile-${label}`}>{value}</span>
      <span className="text-muted-foreground text-sm">{detail}</span>
    </Link>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { PriorityBadge, STATUS_TEXT, TYPE_TEXT } from "@/components/job-bits";
import { selectClass, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { listOpenJobs, listTechnicians, type QueueRow } from "@/lib/data/workOrders";
import { todayInLondon } from "@/lib/dates";

export default function WorkPage({ searchParams }: PageProps<"/work">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading jobs…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/work">["searchParams"] }) {
  const user = await requirePermission("workorder.viewQueue");
  const params = await searchParams;
  const db = getDb();
  const today = todayInLondon();
  const canAssign = can(user, "workorder.assign");
  const technicians = canAssign ? await listTechnicians(db) : [];
  const requested = typeof params.tech === "string" && UUID.test(params.tech) ? params.tech : null;
  const techId = canAssign && requested && technicians.some((t) => t.id === requested) ? requested : user.id;
  const techName = techId === user.id ? "My jobs" : `${technicians.find((t) => t.id === techId)?.name}'s jobs`;
  const [mine, unassigned] = await Promise.all([listOpenJobs(db, techId, today), listOpenJobs(db, null, today)]);

  return (
    <>
      {canAssign && (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tech">Show the queue for</Label>
            <select id="tech" name="tech" defaultValue={techId} className={selectClass}>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.openJobs} open)</option>)}
            </select>
          </div>
          <Button type="submit" variant="outline">Show</Button>
        </form>
      )}
      <JobList title={techName} rows={mine} today={today} empty="No open jobs. Pick one up from the unassigned list below." />
      <JobList title="Unassigned" rows={unassigned} today={today} empty="Nothing waiting to be picked up." />
    </>
  );
}

function JobList({ title, rows, today, empty }: { title: string; rows: QueueRow[]; today: string; empty: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-medium">{title} <span className="text-muted-foreground font-normal">({rows.length})</span></h2>
      {rows.length === 0 ? <p className="text-muted-foreground text-sm">{empty}</p> : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((j) => {
            const overdue = j.dueOn !== null && j.dueOn < today;
            return (
              <li key={j.id}>
                <Link href={`/work/${j.id}`} className="hover:bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <PriorityBadge priority={j.priority} />
                  <span className="flex min-w-48 flex-1 flex-col">
                    <span className="font-medium">
                      {TYPE_TEXT[j.type]} · {j.modelName}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      <span className="font-mono">{j.number}</span> · <span className="font-mono">{j.giai}</span>
                      {j.roomName ? ` · ${j.roomName}` : ""}
                    </span>
                    {j.faultReason && <span className="text-sm">{j.faultReason}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1 text-sm">
                    <span className={overdue ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                      {j.dueOn ? `${overdue ? "Overdue since" : "Due"} ${j.dueOn}` : `Raised ${j.createdAt}`}
                    </span>
                    <span className="text-muted-foreground">{STATUS_TEXT[j.status]}</span>
                  </span>
                  <StatusBadge display={j.display} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

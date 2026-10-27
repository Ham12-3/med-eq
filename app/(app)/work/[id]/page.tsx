import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { OUTCOME_TEXT, PriorityBadge, STATUS_TEXT, TYPE_TEXT } from "@/components/job-bits";
import { ReasonList, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getJob, listTechnicians, type Job } from "@/lib/data/workOrders";
import { todayInLondon } from "@/lib/dates";
import { blockerText, closeBlockers, OPEN_STATUSES } from "@/lib/rules/workOrder";
import { ActionNotesForm, CloseForm, InspectionForm, JobControls, PartForm, ResultsForm } from "./job-forms";

export default function JobPage({ params }: PageProps<"/work/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading job…</p>}>
        <JobView params={params} />
      </Suspense>
    </main>
  );
}

async function JobView({ params }: { params: PageProps<"/work/[id]">["params"] }) {
  const user = await requirePermission("workorder.viewQueue");
  const { id } = await params;
  const db = getDb();
  const job = await getJob(db, id, todayInLondon());
  if (!job) notFound();

  const open = OPEN_STATUSES.includes(job.status);
  const mayWork = open && can(user, "workorder.work") && (!job.assigneeId || job.assigneeId === user.id || can(user, "workorder.assign"));
  const technicians = open && can(user, "workorder.assign") ? await listTechnicians(db) : null;
  const blockers = closeBlockers({
    type: job.type, status: job.status, inspection: job.inspection ?? null, items: job.items, results: job.results,
    unusableAnalyserIds: job.analysers.filter((a) => a.doNotUse).map((a) => a.id), actionNotes: job.actionNotes,
  }).map(blockerText);

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link href="/work" className="text-muted-foreground text-sm hover:underline">← Jobs</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{TYPE_TEXT[job.type]} <span className="font-mono text-xl">{job.number}</span></h1>
          <PriorityBadge priority={job.priority} />
          <span className="text-sm" data-testid="job-status" aria-live="polite">{job.outcome ? OUTCOME_TEXT[job.outcome] : STATUS_TEXT[job.status]}</span>
        </div>
        <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>Raised {job.createdAt} by {job.reportedByName}</div>
          <div>{job.dueOn ? `Due ${job.dueOn}` : "No due date"}</div>
          <div>Assigned to {job.assigneeName ?? "nobody yet"}</div>
          <div>{job.completedAt ? `Closed ${job.completedAt} by ${job.closedByName}` : job.startedAt ? `Started ${job.startedAt}` : "Not started"}</div>
        </dl>
        {job.faultReason && job.type !== "recall" && <p className="rounded-lg border px-4 py-2 text-sm">Fault reported: <strong>{job.faultReason}</strong></p>}
        {mayWork && <JobControls job={job} technicians={technicians} />}
      </header>

      <Section title="Device">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/assets/${job.asset.id}`} className="font-medium underline-offset-4 hover:underline">{job.asset.modelName}</Link>
            <p className="text-muted-foreground font-mono text-sm">{job.asset.giai} · {job.asset.serialNumber}</p>
            <p className="text-muted-foreground text-sm">{job.asset.roomName ? `${job.asset.roomName}, ${job.asset.buildingName}, ${job.asset.floorName}` : "No location"}</p>
          </div>
          <StatusBadge display={job.asset.display} />
        </div>
        <ReasonList reasons={job.asset.reasons} />
      </Section>

      {job.type === "recall" && job.noticeId && (
        <Section title="Safety notice">
          <p className="text-sm">
            <Link href={`/notices/${job.noticeId}`} className="font-mono underline-offset-4 hover:underline">{job.noticeReference}</Link> · {job.noticeTitle}
          </p>
          <p className="rounded-lg border px-4 py-2 text-sm">Required action: <strong>{job.noticeAction}</strong></p>
          {!mayWork && job.actionNotes && <p className="text-sm">Action taken: {job.actionNotes}</p>}
        </Section>
      )}

      {mayWork && job.type === "recall" ? (
        <>
          <Section title="Action taken" hint="What was done to this device for the notice.">
            <ActionNotesForm job={job} />
          </Section>
          <Section title="Close" hint="Closing marks this device as actioned on the notice.">
            <CloseForm job={job} blockers={blockers} />
          </Section>
        </>
      ) : mayWork ? (
        <>
          <Section title="1. Initial inspection" hint="Is it clean and decontaminated? Note the control settings as found.">
            <InspectionForm job={job} />
          </Section>
          <Section title="2. Parts replaced" hint="Every part, its supplier and lot number, for recall tracing.">
            <PartsTable parts={job.parts} />
            <PartForm job={job} />
          </Section>
          <Section title="3. Calibration" hint="Recorded with the inspection above.">
            <p className="text-muted-foreground text-sm">{job.calibrationNotes || "Nothing recorded yet."}</p>
          </Section>
          <Section title="4. Performance and safety tests" hint={`From ${job.templateName ?? "the device's test template"}. Pass or fail for readings is worked out from the limits.`}>
            {job.items.length > 0 ? <ResultsForm job={job} /> : <p className="text-muted-foreground text-sm">This job has no tests.</p>}
          </Section>
          <Section title="5. Return to use" hint="Closing records the outcome and updates the device and its PPM schedule. A failed PPM quarantines the device and opens a repair.">
            <CloseForm job={job} blockers={blockers} />
          </Section>
        </>
      ) : (
        <ClosedRecord job={job} open={open} />
      )}
    </>
  );
}

function ClosedRecord({ job, open }: { job: Job; open: boolean }) {
  const results = new Map(job.results.filter((r) => r.phase === "after").map((r) => [r.templateItemId, r]));
  return (
    <>
      {open && <p className="text-muted-foreground text-sm">This job is assigned to {job.assigneeName}. You can see it but not change it.</p>}
      {!open && job.outcome && job.type !== "recall" && (
        <p>
          <a href={`/work/${job.id}/label.pdf`} target="_blank" rel="noopener" className={buttonVariants()}>
            {job.outcome === "returned_to_use" || job.outcome === "no_fault_found" ? "Print SERVICED label" : "Print DO NOT USE label"}
          </a>
        </p>
      )}
      <Section title="Inspection and calibration">
        <p className="text-sm">
          {job.inspection
            ? `${job.inspection.clean ? "Clean" : "Not clean"}, ${job.inspection.decontaminated ? "decontaminated" : "not decontaminated"}. Settings: ${job.inspection.controlSettings || "not noted"}.`
            : "Not recorded."}
        </p>
        {job.calibrationNotes && <p className="text-sm">Calibration: {job.calibrationNotes}</p>}
      </Section>
      <Section title="Parts replaced"><PartsTable parts={job.parts} /></Section>
      <Section title="Tests">
        <Table>
          <TableHeader><TableRow><TableHead>Test</TableHead><TableHead>Reading</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
          <TableBody>
            {job.items.map((i) => {
              const r = results.get(i.id);
              return (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>{r?.value ? `${r.value} ${i.unit ?? ""}` : r ? "Checked" : ""}</TableCell>
                  <TableCell className={r?.outcome === "fail" ? "text-destructive font-medium" : ""}>{r ? r.outcome.replaceAll("_", " ") : "Not tested"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}

function PartsTable({ parts }: { parts: Job["parts"] }) {
  if (parts.length === 0) return <p className="text-muted-foreground text-sm">No parts recorded.</p>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Supplier</TableHead><TableHead>Lot</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
      <TableBody>
        {parts.map((p) => (
          <TableRow key={p.id}>
            <TableCell>{p.description}<span className="text-muted-foreground block font-mono text-xs">{p.partNumber}</span></TableCell>
            <TableCell>{p.supplier}</TableCell>
            <TableCell className="font-mono text-xs">{p.lotNumber ?? ""}</TableCell>
            <TableCell>{p.quantity}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

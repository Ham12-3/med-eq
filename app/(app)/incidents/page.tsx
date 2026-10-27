import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { HARM_TEXT, INCIDENT_STATUS_TEXT, listIncidents } from "@/lib/data/incidents";

export default function IncidentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
        <Link href="/incidents/new" className={buttonVariants()}>Log an incident</Link>
      </div>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Incidents />
      </Suspense>
    </main>
  );
}

async function Incidents() {
  await requirePermission("incident.manage");
  const incidents = await listIncidents(getDb());
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Incident</TableHead><TableHead>Device</TableHead><TableHead>Harm</TableHead><TableHead>MHRA</TableHead><TableHead>Status</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {incidents.map((i) => (
          <TableRow key={i.id}>
            <TableCell className="max-w-md">
              <Link href={`/incidents/${i.id}`} className="font-mono text-sm font-medium underline-offset-4 hover:underline">{i.reference}</Link>
              <span className="text-muted-foreground"> · {i.occurredAt}</span>
              <span className="block truncate text-sm">{i.description}</span>
            </TableCell>
            <TableCell className="text-sm">{i.modelName ?? "None"}{i.giai && <span className="text-muted-foreground block font-mono text-xs">{i.giai}</span>}</TableCell>
            <TableCell className="text-sm">{HARM_TEXT[i.harmLevel]}</TableCell>
            <TableCell className="text-sm">{i.reportedToMhra ? <span className="font-mono">{i.yellowCardRef}</span> : "Not reported"}</TableCell>
            <TableCell className="text-sm">{INCIDENT_STATUS_TEXT[i.status]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

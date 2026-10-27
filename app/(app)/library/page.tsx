import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { roomOptions } from "@/lib/data/assets";
import { libraryDevices, stockByModel } from "@/lib/data/library";
import { daysBetween, todayInLondon } from "@/lib/dates";
import { LOAN_CHASE_DAYS } from "@/lib/rules/library";
import { markReadyAction } from "./actions";
import { LibraryDesk } from "./library-desk";

export default function LibraryPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Equipment library</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Library />
      </Suspense>
    </main>
  );
}

async function Library() {
  await requirePermission("library.checkInOut");
  const db = getDb();
  const today = todayInLondon();
  const [devices, rooms] = await Promise.all([libraryDevices(db, today), roomOptions(db)]);
  const stock = stockByModel(devices);
  const needsPrep = devices.filter((d) => d.state === "needs_prep");
  const chase = devices.filter((d) => d.loanOverdue).sort((a, b) => a.onLoanSince!.localeCompare(b.onLoanSince!));

  return (
    <>
      <LibraryDesk rooms={rooms} />

      <section aria-label="Stock by model" className="flex flex-col gap-2">
        <h2 className="font-medium">Stock by model</h2>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Model</TableHead><TableHead>Ready</TableHead><TableHead>Needs prep</TableHead><TableHead>On loan</TableHead><TableHead>In workshop</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {stock.map((s) => (
              <TableRow key={s.modelName}>
                <TableCell>{s.modelName}</TableCell>
                <TableCell className="font-medium">{s.ready}</TableCell>
                <TableCell>{s.needsPrep}</TableCell>
                <TableCell>{s.onLoan}</TableCell>
                <TableCell>{s.inWorkshop}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-label="Needs cleaning or charging" className="flex flex-col gap-2">
        <h2 className="font-medium">Needs cleaning or charging <span className="text-muted-foreground font-normal">({needsPrep.length})</span></h2>
        {needsPrep.length === 0 ? <p className="text-muted-foreground text-sm">Everything in the library is ready.</p> : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {needsPrep.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {d.modelName} · <Link href={`/assets/${d.id}`} className="font-mono text-sm underline-offset-4 hover:underline">{d.giai}</Link>
                  <span className="text-muted-foreground text-sm">
                    {d.lastDirection === "check_in" ? ` · checked in ${d.cleaned ? "cleaned" : "not cleaned"}, ${d.charged ? "charged" : "not charged"}` : " · no check-in record"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge display={d.display} />
                  {!d.doNotUse && (
                    <form action={markReadyAction}>
                      <input type="hidden" name="assetId" value={d.id} />
                      <Button type="submit" variant="outline" size="sm">Mark ready</Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="On loan to chase" className="flex flex-col gap-2">
        <h2 className="font-medium">
          Out longer than {LOAN_CHASE_DAYS} days <span className="text-muted-foreground font-normal">({chase.length})</span>
        </h2>
        {chase.length === 0 ? <p className="text-muted-foreground text-sm">No loans to chase.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Device</TableHead><TableHead>Where</TableHead><TableHead>Out since</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {chase.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.modelName}<Link href={`/assets/${d.id}`} className="block font-mono text-xs underline-offset-4 hover:underline">{d.giai}</Link></TableCell>
                  <TableCell>{d.roomName}<span className="text-muted-foreground block text-xs">{d.outToDept ?? d.floorLabel}</span></TableCell>
                  <TableCell>{d.onLoanSince} <span className="text-muted-foreground text-xs">({daysBetween(d.onLoanSince!, today)} days)</span></TableCell>
                  <TableCell><StatusBadge display={d.display} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}

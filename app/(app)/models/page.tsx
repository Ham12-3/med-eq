import Link from "next/link";
import { Suspense } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { listModelScores } from "@/lib/data/em";
import { SCHEDULED_PPM_THRESHOLD } from "@/lib/rules/emScore";

export default function ModelsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Device models and risk scores</h1>
        <p className="text-muted-foreground text-sm">
          Fennigkoh and Smith EM score: function + physical risk + maintenance need + incident history.
          A score of {SCHEDULED_PPM_THRESHOLD} or more puts a model on scheduled PPM. Recalculated every night from the last 24 months.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Models />
      </Suspense>
    </main>
  );
}

async function Models() {
  await requirePermission("model.manage");
  const models = await listModelScores(getDb());
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">EM</TableHead>
          <TableHead>Breakdown</TableHead>
          <TableHead>Failures / asset-year</TableHead>
          <TableHead>PPM</TableHead>
          <TableHead>Assets</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map((m) => {
          const scheduled = m.total !== null && m.total >= SCHEDULED_PPM_THRESHOLD;
          return (
            <TableRow key={m.id}>
              <TableCell>
                <Link href={`/models/${m.id}`} className="font-medium underline-offset-4 hover:underline">{m.name}</Link>
                <span className="text-muted-foreground block text-xs">{m.category.replaceAll("_", " ")}</span>
              </TableCell>
              <TableCell className="text-right text-lg font-semibold">{m.total ?? "–"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {m.fn} + {m.risk} + {m.maintenance} {m.incidentHistory !== null && (m.incidentHistory >= 0 ? `+ ${m.incidentHistory}` : `− ${-m.incidentHistory}`)}
              </TableCell>
              <TableCell className="text-sm">{m.failuresPerAssetYear ? Number(m.failuresPerAssetYear).toFixed(2) : "–"}</TableCell>
              <TableCell className="text-sm">
                {scheduled ? "Scheduled PPM" : <span className="text-amber-800 dark:text-amber-300">Below {SCHEDULED_PPM_THRESHOLD}: consider inspection only</span>}
                <span className="text-muted-foreground block text-xs">
                  Every {m.intervalMonths} months{m.intervalReason ? `. ${m.intervalReason}` : ""}
                </span>
              </TableCell>
              <TableCell>{m.assets}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

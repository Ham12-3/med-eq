import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { listModelScores, scoreHistory } from "@/lib/data/em";
import { SCHEDULED_PPM_THRESHOLD } from "@/lib/rules/emScore";
import { EmForm } from "./em-form";

export default function ModelPage({ params }: PageProps<"/models/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Model params={params} />
      </Suspense>
    </main>
  );
}

async function Model({ params }: { params: PageProps<"/models/[id]">["params"] }) {
  await requirePermission("model.manage");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const model = (await listModelScores(db)).find((m) => m.id === id);
  if (!model) notFound();
  const [history, items] = await Promise.all([
    scoreHistory(db, id),
    db.execute<{ name: string; group: string; kind: string; unit: string | null; lower: string | null; upper: string | null; required: boolean }>(sql`
      select i.name, i."group", i.kind, i.unit, i.lower_limit::text as lower, i.upper_limit::text as upper, i.required
      from device_models m join test_template_items i on i.template_id = m.test_template_id
      where m.id = ${id} order by i.position`),
  ]);

  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/models" className="text-muted-foreground text-sm hover:underline">← Device models</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{model.name}</h1>
        <p className="text-sm">
          EM score <strong className="text-lg">{model.total ?? "not yet calculated"}</strong>
          {model.total !== null && (model.total >= SCHEDULED_PPM_THRESHOLD ? " · scheduled PPM" : ` · below ${SCHEDULED_PPM_THRESHOLD}`)}
          {model.calculatedOn && <span className="text-muted-foreground"> · calculated {model.calculatedOn}</span>}
        </p>
        <p className="text-muted-foreground text-sm">
          PPM every {model.intervalMonths} months{model.intervalReason ? `. ${model.intervalReason}` : ""}. {model.assets} assets in service or awaiting use.
        </p>
      </header>

      <section aria-label="Score" className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">Calculator</h2>
        <p className="text-muted-foreground text-sm">
          Incident history is not chosen: it is worked out from repairs and incidents in the last 24 months
          ({model.failuresPerAssetYear ? `${Number(model.failuresPerAssetYear).toFixed(2)} failures per asset-year, scoring ${model.incidentHistory}` : "not yet calculated"}).
        </p>
        <EmForm modelId={model.id} fn={model.fn} risk={model.risk} maintenance={model.maintenance} />
      </section>

      <section aria-label="Score history" className="flex flex-col gap-2">
        <h2 className="font-medium">Score history</h2>
        <Table>
          <TableHeader>
            <TableRow><TableHead>When</TableHead><TableHead>Function</TableHead><TableHead>Risk</TableHead><TableHead>Maintenance</TableHead><TableHead>History</TableHead><TableHead>Failures / asset-year</TableHead><TableHead>Total</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.on}</TableCell><TableCell>{h.fn}</TableCell><TableCell>{h.risk}</TableCell><TableCell>{h.maintenance}</TableCell>
                <TableCell>{h.incidentHistory}</TableCell><TableCell>{Number(h.failuresPerAssetYear).toFixed(2)}</TableCell>
                <TableCell className="font-semibold">{h.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-label="Test template" className="flex flex-col gap-2">
        <h2 className="font-medium">Test template</h2>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {items.map((i) => (
            <li key={i.name} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span>{i.name}{!i.required && <span className="text-muted-foreground"> (optional)</span>}</span>
              <span className="text-muted-foreground">
                {i.kind === "check" ? "Pass or fail" : [i.lower !== null && `≥ ${i.lower}`, i.upper !== null && `≤ ${i.upper}`].filter(Boolean).join(" and ") + ` ${i.unit ?? ""}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

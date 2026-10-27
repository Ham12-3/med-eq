import { CircleCheck, OctagonX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { InUseToggle } from "@/components/in-use-toggle";
import { ReasonList, StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getAssetHistory, getAssetSummary, type AssetHistory, type AssetSummary } from "@/lib/data/assets";
import { todayInLondon } from "@/lib/dates";

export default function AssetPage({ params }: PageProps<"/assets/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading device…</p>}>
        <Device params={params} />
      </Suspense>
    </main>
  );
}

async function Device({ params }: { params: PageProps<"/assets/[id]">["params"] }) {
  const user = await requirePermission("asset.view");
  const { id } = await params;
  const db = getDb();
  const today = todayInLondon();
  const asset = await getAssetSummary(db, id, today);
  if (!asset) notFound();
  const full = can(user, "asset.viewRegister");
  const history = full ? await getAssetHistory(db, asset) : null;

  return (
    <>
      <header className="flex flex-col gap-3">
        {full && <Link href="/assets" className="text-muted-foreground text-sm hover:underline">← Asset register</Link>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{asset.modelName}</h1>
          <StatusBadge display={asset.display} />
        </div>
        <p className="font-mono text-sm">{asset.giai}</p>
      </header>

      <SafetyBanner asset={asset} />

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Where it is">
          {asset.roomName ? (
            <p>
              <strong>{asset.roomName}</strong>
              <br />
              <span className="text-muted-foreground text-sm">{asset.buildingName}, {asset.floorName}. Last seen {asset.seenAt}.</span>
            </p>
          ) : <p className="text-muted-foreground">No location recorded.</p>}
          {can(user, "device.markInUse") && asset.lifecycleStatus === "in_service" && (
            <InUseToggle assetId={asset.id} inUse={asset.inUse} doNotUse={asset.doNotUse} />
          )}
        </Card>
        <Card title="Maintenance">
          <Facts rows={[
            ["PPM interval", asset.intervalMonths ? `${asset.intervalMonths} months${asset.intervalReason ? ` (${asset.intervalReason})` : ""}` : "No schedule"],
            ["Last PPM", asset.lastDoneOn ?? "None recorded"],
            ["Next PPM due", asset.nextDueOn ? `${asset.nextDueOn}${asset.scheduleActive ? "" : " (schedule closed)"}` : "None"],
          ]} />
        </Card>
      </section>

      {full && history && <FullRecord asset={asset} history={history} today={today} />}
    </>
  );
}

function SafetyBanner({ asset }: { asset: AssetSummary }) {
  if (asset.display === "decommissioned") {
    return <p className="bg-muted rounded-lg px-4 py-3 text-sm">This device has been decommissioned and is no longer in use.</p>;
  }
  if (asset.doNotUse) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg bg-red-50 px-4 py-3 text-red-950 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-50">
        <p className="flex items-center gap-2 text-lg font-semibold"><OctagonX aria-hidden className="size-5" /> Do not use this device</p>
        <ReasonList reasons={asset.reasons} />
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-950 ring-1 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-50">
      <CircleCheck aria-hidden className="size-5" /> Safe to use
    </p>
  );
}

function FullRecord({ asset, history, today }: { asset: AssetSummary; history: AssetHistory; today: string }) {
  const resultsByJob = Map.groupBy(history.results, (r) => r.workOrderId);
  const pastEol = asset.endOfLifeDate !== null && asset.endOfLifeDate < today;
  return (
    <>
      <Card title="Device record">
        <Facts columns rows={[
          ["Serial number", asset.serialNumber],
          ["Manufacturer", asset.manufacturer],
          ["Owner", asset.ownerName],
          ["Lifecycle", asset.lifecycleStatus.replaceAll("_", " ")],
          ["Firmware", asset.firmwareVersion ?? "Not applicable"],
          ["Acquired", asset.acquisitionType.replaceAll("_", " ")],
          ["Purchase date", asset.purchaseDate ?? "Unknown"],
          ["Purchase price", asset.purchasePricePence === null ? "Not recorded" : `£${(asset.purchasePricePence / 100).toLocaleString("en-GB")}`],
          ["Accepted into service", asset.acceptedAt ?? "Not yet"],
          ["End of life", asset.endOfLifeDate ? `${asset.endOfLifeDate}${pastEol ? " (passed)" : ""}` : "Not set"],
        ]} />
      </Card>

      <Card title="Jobs and tests">
        {history.workOrders.length === 0 ? <p className="text-muted-foreground text-sm">No jobs yet.</p> : (
          <ul className="flex flex-col divide-y">
            {history.workOrders.map((w) => {
              const results = resultsByJob.get(w.id) ?? [];
              const failed = results.filter((r) => r.outcome === "fail").length;
              return (
                <li key={w.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                      <span className="font-mono">{w.number}</span>
                      <span className="font-medium uppercase">{w.type}</span>
                      <span>{w.outcome ? w.outcome.replaceAll("_", " ") : w.status.replaceAll("_", " ")}</span>
                      <span className="text-muted-foreground">
                        {w.completedAt ? `Completed ${w.completedAt}` : `Raised ${w.createdAt}`}{w.assignee ? ` · ${w.assignee}` : ""}
                      </span>
                      {results.length > 0 && (
                        <span className={failed ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {failed ? `${failed} failed of ${results.length} tests` : `${results.length} tests passed`}
                        </span>
                      )}
                    </summary>
                    {w.faultReason && <p className="mt-2 text-sm">Fault: {w.faultReason}</p>}
                    {results.length > 0 && (
                      <Table className="mt-2">
                        <TableHeader>
                          <TableRow><TableHead>Test</TableHead><TableHead>Reading</TableHead><TableHead>Limits</TableHead><TableHead>Result</TableHead><TableHead>Analyser</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell>{r.name}</TableCell>
                              <TableCell>{r.value === null ? "Checked" : `${r.value} ${r.unit ?? ""}`}</TableCell>
                              <TableCell className="text-muted-foreground">{limits(r.lower, r.upper, r.unit)}</TableCell>
                              <TableCell className={r.outcome === "fail" ? "text-destructive font-medium" : ""}>{r.outcome.replaceAll("_", " ")}</TableCell>
                              <TableCell className="font-mono text-xs">{r.analyser ?? ""}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Location history">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Room</TableHead><TableHead>How</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.locations.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{l.at}</TableCell>
                  <TableCell>{l.roomName}<span className="text-muted-foreground block text-xs">{l.floorLabel}</span></TableCell>
                  <TableCell className="text-muted-foreground">{l.source}{l.by ? ` by ${l.by}` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card title="Parts used">
          {history.parts.length === 0 ? <p className="text-muted-foreground text-sm">No parts recorded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Supplier and lot</TableHead><TableHead>Job</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.parts.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.description}<span className="text-muted-foreground block font-mono text-xs">{p.partNumber} × {p.quantity}</span></TableCell>
                    <TableCell>{p.supplier}<span className="text-muted-foreground block font-mono text-xs">{p.lotNumber ?? "No lot"}</span></TableCell>
                    <TableCell className="font-mono text-xs">{p.number}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Audit trail">
        <p className="text-muted-foreground text-sm">Every change to this device and its PPM schedule. Records are never deleted or overwritten.</p>
        <ul className="flex flex-col divide-y text-sm">
          {history.audit.map((a) => (
            <li key={a.id} className="py-2">
              <span className="text-muted-foreground">{a.at}</span> · {a.by ?? "Unknown"} · {a.action === "insert" ? "created" : "changed"} {a.tableName === "assets" ? "device record" : "PPM schedule"}
              {a.changes.length > 0 && (
                <ul className="mt-1 ml-4 list-disc">
                  {a.changes.map((c) => (
                    <li key={c.field}><span className="font-mono text-xs">{c.field}</span>: {String(c.from)} → {String(c.to)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function limits(lower: string | null, upper: string | null, unit: string | null) {
  const u = unit ? ` ${unit}` : "";
  if (lower !== null && upper !== null) return `${lower} to ${upper}${u}`;
  if (upper !== null) return `≤ ${upper}${u}`;
  if (lower !== null) return `≥ ${lower}${u}`;
  return "";
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ rows, columns }: { rows: [string, string][]; columns?: boolean }) {
  return (
    <dl className={columns ? "grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" : "grid gap-y-2 text-sm"}>
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[10rem_1fr] gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

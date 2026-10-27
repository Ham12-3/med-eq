import Link from "next/link";
import { Suspense } from "react";
import { selectClass, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { filterOptions, findNearestAvailable, UUID } from "@/lib/data/assets";
import { todayInLondon } from "@/lib/dates";

export default function FindPage({ searchParams }: PageProps<"/find">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Find the nearest available device</h1>
        <p className="text-muted-foreground text-sm">Working, in date and not in use, nearest to you first.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Finder searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Finder({ searchParams }: { searchParams: PageProps<"/find">["searchParams"] }) {
  await requirePermission("device.find");
  const params = await searchParams;
  const db = getDb();
  const options = await filterOptions(db);
  const model = typeof params.model === "string" && options.models.some((m) => m.slug === params.model) ? params.model : "";
  const room = typeof params.room === "string" && UUID.test(params.room) ? params.room : "";
  const floors = [...new Map(options.rooms.map((r) => [r.floorId, r.floorLabel])).entries()];
  const results = model && room ? await findNearestAvailable(db, room, model, todayInLondon()) : null;
  const clinicalModels = options.models.filter((m) => m.slug !== "electrical-safety-analyser");

  return (
    <>
      <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="model">Device</Label>
          <select id="model" name="model" defaultValue={model} required className={selectClass}>
            <option value="" disabled>Choose a device</option>
            {clinicalModels.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room">You are in</Label>
          <select id="room" name="room" defaultValue={room} required className={selectClass}>
            <option value="" disabled>Choose a room</option>
            {floors.map(([floorId, label]) => (
              <optgroup key={floorId} label={label}>
                {options.rooms.filter((r) => r.floorId === floorId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <Button type="submit">Find</Button>
      </form>

      {results === null && model && room && <p role="alert" className="text-destructive text-sm">That room was not found.</p>}
      {results && (
        <section aria-label="Nearest available" className="flex flex-col gap-2">
          <p className="text-sm" aria-live="polite">
            {results.length === 0 ? "None available right now. Ask the equipment library." : `${results.length} available, nearest first.`}
          </p>
          <ol className="flex flex-col divide-y rounded-lg border">
            {results.slice(0, 20).map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex flex-col">
                  <span><span className="text-muted-foreground mr-2 text-sm">{i + 1}.</span><strong>{r.roomName}</strong> <span className="text-muted-foreground text-sm">· {r.floorLabel}</span></span>
                  <span className="text-muted-foreground text-sm">
                    {r.distance}{r.roomType === "equipment_library" ? " · Equipment library" : ""} ·{" "}
                    <Link href={`/assets/${r.id}`} className="font-mono underline-offset-4 hover:underline">{r.giai}</Link>
                    {r.seenAt ? ` · seen ${r.seenAt}` : ""}
                  </span>
                </div>
                <StatusBadge display={r.display} />
              </li>
            ))}
          </ol>
          {results.length > 20 && <p className="text-muted-foreground text-sm">Showing the nearest 20 of {results.length}.</p>}
        </section>
      )}
    </>
  );
}

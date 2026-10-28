import Link from "next/link";
import { Suspense } from "react";
import { selectClass, StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { floorMap, mapFilterOptions, mapFloors } from "@/lib/data/map";
import { todayInLondon } from "@/lib/dates";
import { isFiltering, mapFiltersToQuery, parseMapFilters } from "@/lib/map/filters";
import { MATCH_TEXT } from "@/lib/map/status";
import { cn } from "@/lib/utils";
import { MapView } from "./map-view";

export default function MapPage({ searchParams }: PageProps<"/map">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading the map…</p>}>
        <MapPageBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MapPageBody({ searchParams }: { searchParams: PageProps<"/map">["searchParams"] }) {
  await requirePermission("asset.view");
  const filters = parseMapFilters(await searchParams);
  const db = getDb();
  const [floors, options] = await Promise.all([mapFloors(db, filters), mapFilterOptions(db)]);
  const notice = options.notices.find((n) => n.id === filters.notice) ?? null;
  // In recall mode, open on the first floor that has a matched device.
  const floor = floors.find((f) => f.id === filters.floor)
    ?? (notice ? floors.find((f) => f.devices > 0) : undefined)
    ?? floors[0];
  if (!floor) return <p className="text-muted-foreground text-sm">No floors are set up.</p>;
  const { plan, modelNode, markers, context, counts } = await floorMap(db, floor.id, todayInLondon(), filters);
  const byRoom = plan.rooms.map((room) => ({ room, devices: markers.filter((m) => m.roomId === room.id) }));
  const filtering = isFiltering(filters);

  return (
    <>
      <form method="get" aria-label="Filter the map" className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
        <input type="hidden" name="floor" value={floor.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="model">Model</Label>
          <select id="model" name="model" defaultValue={filters.model} className={selectClass}>
            <option value="">Any</option>
            {options.models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dept">Owner</Label>
          <select id="dept" name="dept" defaultValue={filters.dept} className={selectClass}>
            <option value="">Any</option>
            {options.departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notice">Show recall</Label>
          <select id="notice" name="notice" defaultValue={filters.notice} className={selectClass}>
            <option value="">No safety notice</option>
            {options.notices.map((n) => <option key={n.id} value={n.id}>{n.reference}{n.status === "closed" ? " (closed)" : ""}: {n.title}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Show</Button>
          {filtering && <Link href={`/map?${mapFiltersToQuery({ floor: floor.id, model: "", dept: "", notice: "" })}`} className={buttonVariants({ variant: "outline" })}>Clear</Link>}
        </div>
      </form>

      <nav aria-label="Floors" className="flex flex-wrap gap-2">
        {floors.map((f) => (
          <Link key={f.id} href={`/map?${mapFiltersToQuery(filters, { floor: f.id })}`} aria-current={f.id === floor.id ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", f.id === floor.id ? "bg-foreground text-background" : "hover:bg-muted",
              notice && f.devices > 0 && f.id !== floor.id && "border-red-400")}>
            {f.label} <span className="opacity-70">({f.devices})</span>
          </Link>
        ))}
      </nav>

      <MapView key={`${floor.id}-${mapFiltersToQuery(filters)}`} floorId={floor.id} plan={plan} modelNode={modelNode} markers={markers} context={context}
        counts={counts} recall={notice ? { reference: notice.reference, title: notice.title } : null} />

      <section aria-label="Devices on this floor, by room" className="flex flex-col gap-2">
        <h2 className="font-medium">List view: {floor.label}</h2>
        <p className="text-muted-foreground text-sm">
          Everything on the map, as a list. {markers.length} devices in {plan.rooms.length} rooms
          {filtering ? ` match the filters (${context.length} others hidden)` : ""}.
        </p>
        <ul className="flex flex-col divide-y rounded-lg border">
          {byRoom.filter(({ devices }) => !filtering || devices.length > 0).map(({ room, devices }) => {
            const problems = devices.filter((d) => d.status === "do_not_use" || d.status === "recalled").length;
            return (
              <li key={room.id}>
                <details open={filtering}>
                  <summary className="hover:bg-muted/50 flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="font-medium">{room.name}</span>
                    <span className="text-muted-foreground">
                      {devices.length} {devices.length === 1 ? "device" : "devices"}
                      {problems > 0 && <span className="ml-2 font-medium text-red-700 dark:text-red-400">{problems} not to use</span>}
                    </span>
                  </summary>
                  {devices.length > 0 && (
                    <ul className="flex flex-col gap-1 px-4 pb-3">
                      {devices.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            {d.modelName} · <Link href={`/assets/${d.id}`} className="font-mono underline-offset-4 hover:underline">{d.giai}</Link>
                            {d.match && <span className="text-muted-foreground"> · recall: {MATCH_TEXT[d.match].toLowerCase()}</span>}
                          </span>
                          <StatusBadge display={d.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

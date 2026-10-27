import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/status-badge";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { UUID } from "@/lib/data/assets";
import { floorMap, mapFloors } from "@/lib/data/map";
import { todayInLondon } from "@/lib/dates";
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
  const params = await searchParams;
  const db = getDb();
  const floors = await mapFloors(db);
  const requested = typeof params.floor === "string" && UUID.test(params.floor) ? params.floor : null;
  const floor = floors.find((f) => f.id === requested) ?? floors[0];
  if (!floor) return <p className="text-muted-foreground text-sm">No floors are set up.</p>;
  const { plan, markers, counts } = await floorMap(db, floor.id, todayInLondon());

  const byRoom = plan.rooms.map((room) => ({ room, devices: markers.filter((m) => m.roomId === room.id) }));

  return (
    <>
      <nav aria-label="Floors" className="flex flex-wrap gap-2">
        {floors.map((f) => (
          <Link key={f.id} href={`/map?floor=${f.id}`} aria-current={f.id === floor.id ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", f.id === floor.id ? "bg-foreground text-background" : "hover:bg-muted")}>
            {f.label} <span className="opacity-70">({f.devices})</span>
          </Link>
        ))}
      </nav>

      <MapView key={floor.id} floorId={floor.id} plan={plan} markers={markers} counts={counts} />

      <section aria-label="Devices on this floor, by room" className="flex flex-col gap-2">
        <h2 className="font-medium">List view: {floor.label}</h2>
        <p className="text-muted-foreground text-sm">Everything on the map, as a list. {markers.length} devices in {plan.rooms.length} rooms.</p>
        <ul className="flex flex-col divide-y rounded-lg border">
          {byRoom.map(({ room, devices }) => {
            const problems = devices.filter((d) => d.status === "do_not_use" || d.status === "recalled").length;
            return (
              <li key={room.id}>
                <details>
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
                          <span>{d.modelName} · <Link href={`/assets/${d.id}`} className="font-mono underline-offset-4 hover:underline">{d.giai}</Link></span>
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

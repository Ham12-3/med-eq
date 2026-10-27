"use client";

import { Ban, CircleAlert, CircleCheck, Clock, Hand } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FloorPlan } from "@/lib/map/layout";
import { MAP_STATUSES, MAP_STYLE, type MapMarker, type MapStatus } from "@/lib/map/status";

// three.js needs the browser, so the canvas never renders on the server.
const FloorMap = dynamic(() => import("@/components/3d/floor-map"), {
  ssr: false,
  loading: () => <div className="text-muted-foreground flex h-full items-center justify-center text-sm">Loading the 3D view…</div>,
});

const ICON: Record<MapStatus, typeof Ban> = { recalled: CircleAlert, do_not_use: Ban, due_soon: Clock, in_use: Hand, available: CircleCheck };

type Props = { floorId: string; plan: FloorPlan; markers: MapMarker[]; counts: Record<MapStatus, number> };

export function MapView({ floorId, plan, markers, counts }: Props) {
  const [visible, setVisible] = useState<Record<MapStatus, boolean>>(
    Object.fromEntries(MAP_STATUSES.map((s) => [s, true])) as Record<MapStatus, boolean>,
  );
  const [showLabels, setShowLabels] = useState(true);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [hover, setHover] = useState<{ marker: MapMarker; x: number; y: number } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="relative h-[60vh] min-h-96 overflow-hidden rounded-lg border" data-testid="floor-map">
        <FloorMap floorId={floorId} plan={plan} markers={markers} visible={visible} showLabels={showLabels}
          selectedId={selected?.id ?? null} onSelect={setSelected} onHover={setHover} />
        {hover && (
          <div role="tooltip" className="bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-60 rounded-md border px-2 py-1 text-xs shadow"
            style={{ left: hover.x + 12, top: hover.y + 12 }}>
            <div className="font-medium">{hover.marker.modelName}</div>
            <div className="font-mono">{hover.marker.giai}</div>
            <div>{MAP_STYLE[hover.marker.status].label}{hover.marker.reasons.length ? `: ${hover.marker.reasons.join(", ")}` : ""}</div>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <section aria-label="Legend" className="flex flex-col gap-2 rounded-lg border p-3">
          <h2 className="text-sm font-medium">Legend</h2>
          <p className="text-muted-foreground text-xs">Tick to show or hide.</p>
          <ul className="flex flex-col gap-1.5">
            {MAP_STATUSES.map((s) => {
              const Icon = ICON[s];
              return (
                <li key={s}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={visible[s]} onChange={(e) => setVisible((v) => ({ ...v, [s]: e.target.checked }))} />
                    <span className="inline-block size-3 rounded-full" style={{ background: MAP_STYLE[s].color }} aria-hidden />
                    <Icon aria-hidden className="size-4" />
                    <span className="flex-1">{MAP_STYLE[s].label}</span>
                    <span className="tabular-nums" data-testid={`count-${s}`}>{counts[s]}</span>
                  </label>
                  <span className="text-muted-foreground ml-6 block text-xs">{MAP_STYLE[s].shapeText}</span>
                </li>
              );
            })}
          </ul>
          <label className="flex items-center gap-2 border-t pt-2 text-sm">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Room names
          </label>
          <p className="text-muted-foreground text-xs">Drag to turn, scroll to zoom, right-drag to move.</p>
        </section>

        <section aria-label="Selected device" className="flex flex-col gap-2 rounded-lg border p-3" aria-live="polite">
          {selected ? (
            <>
              <h2 className="text-sm font-medium">{selected.modelName}</h2>
              <p className="font-mono text-sm">{selected.giai}</p>
              <p className="text-sm">{MAP_STYLE[selected.status].label} · {selected.roomName}</p>
              {selected.reasons.length > 0 && <p className="text-sm text-red-700 dark:text-red-400">{selected.reasons.join(", ")}</p>}
              <div className="flex gap-2">
                <Link href={`/assets/${selected.id}`} className="text-sm underline underline-offset-4">Open device record</Link>
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Clear</Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Click a device on the map to see it here.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

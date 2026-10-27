import { Search, ScanLine, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { StatusBadge } from "@/components/status-badge";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { devicesInDepartment } from "@/lib/data/workOrders";
import { todayInLondon } from "@/lib/dates";

// Big buttons for ward staff.

export default function WardPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ward</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <WardHome />
      </Suspense>
    </main>
  );
}

async function WardHome() {
  const user = await requirePermission("fault.report");
  const devices = await devicesInDepartment(getDb(), user.departmentName, todayInLondon());
  const rooms = Map.groupBy(devices, (d) => d.roomName);
  const tile = "flex min-h-28 flex-col justify-center gap-2 rounded-xl border p-5 text-lg font-medium";
  return (
    <>
      <p className="text-muted-foreground text-sm">
        Signed in as {user.name}, {ROLE_LABEL[user.role]}{user.departmentName ? `, ${user.departmentName}` : ""}.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/scan" className={`${tile} hover:bg-muted`}>
          <ScanLine aria-hidden className="size-7" /> Check a device
          <span className="text-muted-foreground text-sm font-normal">Scan it to see if it is safe to use</span>
        </Link>
        <Link href="/find" className={`${tile} hover:bg-muted`}>
          <Search aria-hidden className="size-7" /> Find a device
          <span className="text-muted-foreground text-sm font-normal">The nearest working one</span>
        </Link>
        <Link href="/report-fault" className={`${tile} hover:bg-muted`}>
          <TriangleAlert aria-hidden className="size-7" /> Report a fault
          <span className="text-muted-foreground text-sm font-normal">Two taps: the device, then what is wrong</span>
        </Link>
      </div>
      {user.departmentName && (
        <section aria-label="Devices on this ward" className="flex flex-col gap-3">
          <h2 className="font-medium">
            Devices on this ward <span className="text-muted-foreground font-normal">({devices.length}, by where they were last seen)</span>
          </h2>
          {devices.length === 0 ? <p className="text-muted-foreground text-sm">No devices were last seen in {user.departmentName}&rsquo;s rooms.</p> : (
            [...rooms].map(([room, list]) => (
              <details key={room} className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 font-medium">
                  {room} <span className="text-muted-foreground font-normal">({list.length})</span>
                </summary>
                <ul className="divide-y border-t">
                  {list.map((d) => (
                    <li key={d.id}>
                      <Link href={`/assets/${d.id}`} className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <span>{d.modelName} <span className="text-muted-foreground font-mono text-sm">{d.giai}</span></span>
                        <StatusBadge display={d.display} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))
          )}
        </section>
      )}
    </>
  );
}

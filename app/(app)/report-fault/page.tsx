import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { getAssetSummary } from "@/lib/data/assets";
import { devicesInDepartment, FAULT_REASONS } from "@/lib/data/workOrders";
import { todayInLondon } from "@/lib/dates";
import { FaultReport } from "./fault-report";

export default function ReportFaultPage({ searchParams }: PageProps<"/report-fault">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Report a fault</h1>
        <p className="text-muted-foreground text-sm">The device is marked “Do not use” straight away and clinical engineering is told.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/report-fault">["searchParams"] }) {
  const user = await requirePermission("fault.report");
  const params = await searchParams;
  const db = getDb();
  const today = todayInLondon();
  const [devices, asset] = await Promise.all([
    devicesInDepartment(db, user.departmentName, today),
    typeof params.asset === "string" ? getAssetSummary(db, params.asset, today) : null,
  ]);
  const preselected = asset && asset.lifecycleStatus !== "decommissioned"
    ? { id: asset.id, giai: asset.giai, modelName: asset.modelName, roomName: asset.roomName, display: asset.display }
    : null;
  return <FaultReport devices={devices} preselected={preselected} reasons={FAULT_REASONS} departmentName={user.departmentName} />;
}

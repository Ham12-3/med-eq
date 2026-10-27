import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/session";
import { REPORTS } from "@/lib/reports/definitions";

export default function ReportsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <ReportList />
      </Suspense>
    </main>
  );
}

async function ReportList() {
  await requirePermission("report.view");
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {REPORTS.map((r) => (
        <li key={r.slug}>
          <Link href={`/reports/${r.slug}`} className="hover:bg-muted flex h-full flex-col gap-1 rounded-lg border p-4">
            <span className="font-medium">{r.title}</span>
            <span className="text-muted-foreground text-sm">{r.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

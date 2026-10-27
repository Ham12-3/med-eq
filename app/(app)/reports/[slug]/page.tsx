import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/dates";
import { findReport } from "@/lib/reports/definitions";

export default function ReportPage({ params }: PageProps<"/reports/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading report…</p>}>
        <ReportView params={params} />
      </Suspense>
    </main>
  );
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

async function ReportView({ params }: { params: PageProps<"/reports/[slug]">["params"] }) {
  await requirePermission("report.view");
  const { slug } = await params;
  const report = findReport(slug);
  if (!report) notFound();
  const today = todayInLondon();
  const rows = await report.load(getDb(), today);

  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/reports" className="text-muted-foreground text-sm hover:underline">← Reports</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
          <div className="flex gap-2">
            <a href={`/reports/${report.slug}/export?format=csv`} className={buttonVariants({ variant: "outline" })}>Download CSV</a>
            <a href={`/reports/${report.slug}/export?format=pdf`} className={buttonVariants({ variant: "outline" })}>Download PDF</a>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{report.description} As of {today}. {rows.length} rows.</p>
      </header>
      {rows.length === 0 ? <p className="text-muted-foreground text-sm">Nothing to report.</p> : (
        <Table>
          <TableHeader>
            <TableRow>{report.columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {report.columns.map((c) => <TableCell key={c.key}>{cell(row[c.key])}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { selectClass } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db/client";
import { AUDIT_PAGE_SIZE, AUDITED_TABLES, auditFiltersToQuery, describeAuditFilters, parseAuditFilters, type AuditFilters } from "@/lib/audit/filters";
import { requirePermission } from "@/lib/auth/session";
import { auditUsers, changeSummary, searchAudit } from "@/lib/data/audit";

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground text-sm">Every change to every record, who made it and when. Nothing here can be edited or deleted.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<"/admin/audit">["searchParams"] }) {
  await requirePermission("audit.export");
  const filters = parseAuditFilters(await searchParams);
  const db = getDb();
  const [users, result] = await Promise.all([auditUsers(db), searchAudit(db, filters)]);
  const query = auditFiltersToQuery(filters, { page: 1 });
  const userName = users.find((u) => u.id === filters.user)?.name;

  return (
    <>
      <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter the audit log">
        <Field id="asset" label="Device (GIAI)" value={filters.asset} mono />
        <Field id="notice" label="Safety notice reference" value={filters.notice} mono />
        <Field id="from" label="From" value={filters.from} type="date" />
        <Field id="to" label="To" value={filters.to} type="date" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user">Who</Label>
          <select id="user" name="user" defaultValue={filters.user} className={selectClass}>
            <option value="">Anyone</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="table">Record type</Label>
          <select id="table" name="table" defaultValue={filters.table} className={selectClass}>
            <option value="">Any</option>
            {Object.entries(AUDITED_TABLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="action">Kind</Label>
          <select id="action" name="action" defaultValue={filters.action} className={selectClass}>
            <option value="">Created or changed</option>
            <option value="insert">Created</option>
            <option value="update">Changed</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Search</Button>
          <Link href="/admin/audit" className={buttonVariants({ variant: "outline" })}>Clear</Link>
        </div>
      </form>

      {!result.ok ? <p className="text-destructive text-sm" data-error>{result.message}</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" aria-live="polite">
              {describeAuditFilters(filters, { user: userName })} <strong>{result.total}</strong> {result.total === 1 ? "entry" : "entries"}.
            </p>
            <div className="flex gap-2">
              <a href={`/admin/audit/export?${query}${query ? "&" : ""}format=csv`} className={buttonVariants({ variant: "outline" })}>Export CSV</a>
              <a href={`/admin/audit/export?${query}${query ? "&" : ""}format=pdf`} className={buttonVariants({ variant: "outline" })}>Export PDF</a>
            </div>
          </div>
          <ol className="flex flex-col divide-y rounded-lg border" aria-label="Audit entries">
            {result.entries.map((e) => (
              <li key={e.id} className="grid gap-1 px-4 py-2 text-sm sm:grid-cols-[11rem_10rem_1fr]">
                <span className="text-muted-foreground font-mono text-xs">{e.at}</span>
                <span>{e.userName ?? "Unknown"}</span>
                <span>
                  <span className="font-medium">{e.action === "insert" ? "Created" : "Changed"} {e.tableLabel.toLowerCase()}</span>{" "}
                  <span className="font-mono text-xs">{e.recordLabel}</span>
                  {e.action === "update" && <span className="text-muted-foreground block text-xs break-words">{changeSummary(e)}</span>}
                </span>
              </li>
            ))}
          </ol>
          {result.total > AUDIT_PAGE_SIZE && <Pages filters={filters} total={result.total} />}
        </>
      )}
    </>
  );
}

function Field({ id, label, value, type = "text", mono }: { id: string; label: string; value: string; type?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} defaultValue={value} className={mono ? "font-mono" : undefined} autoComplete="off" />
    </div>
  );
}

function Pages({ filters, total }: { filters: AuditFilters; total: number }) {
  const pages = Math.ceil(total / AUDIT_PAGE_SIZE);
  const link = (page: number, text: string, off: boolean) => off
    ? <span className={buttonVariants({ variant: "outline", className: "pointer-events-none opacity-50" })} aria-disabled>{text}</span>
    : <Link href={`?${auditFiltersToQuery(filters, { page })}`} className={buttonVariants({ variant: "outline" })}>{text}</Link>;
  return (
    <nav aria-label="Pages" className="flex items-center gap-2">
      {link(filters.page - 1, "Newer", filters.page <= 1)}
      <span className="text-muted-foreground text-sm">Page {filters.page} of {pages}</span>
      {link(filters.page + 1, "Older", filters.page >= pages)}
    </nav>
  );
}

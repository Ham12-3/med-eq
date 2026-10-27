import Link from "next/link";
import { Suspense } from "react";
import { selectClass } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db/client";
import { filtersToQuery, PAGE_SIZE, parseAssetFilters, sortChange, SORT_KEYS, type AssetFilters, type SortKey } from "@/lib/assets/filters";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { filterOptions, listAssets, listSavedViews } from "@/lib/data/assets";
import { todayInLondon } from "@/lib/dates";
import { DISPLAY_STATUSES, DISPLAY_TEXT } from "@/lib/rules/assetStatus";
import { archiveAssetView, saveAssetView } from "./actions";
import { AssetTable } from "./asset-table";

export default function AssetsPage({ searchParams }: PageProps<"/assets">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Asset register</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading assets…</p>}>
        <Register searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Register({ searchParams }: { searchParams: PageProps<"/assets">["searchParams"] }) {
  const user = await requirePermission("asset.viewRegister");
  const filters = parseAssetFilters(await searchParams);
  const db = getDb();
  const [options, result, views] = await Promise.all([
    filterOptions(db),
    listAssets(db, filters, todayInLondon()),
    listSavedViews(db, user.id, "assets"),
  ]);

  const query = filtersToQuery(filters, { page: 1 });
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const sortHrefs = Object.fromEntries(
    SORT_KEYS.map((key) => [key, filtersToQuery(filters, sortChange(filters, key))]),
  ) as Record<SortKey, string>;
  const floors = [...new Map(options.rooms.map((r) => [r.floorId, r.floorLabel])).entries()];

  return (
    <>
      {can(user, "asset.register") && (
        <Link href="/assets/new" className={`${buttonVariants({ variant: "outline" })} self-start`}>Register a new device</Link>
      )}
      <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter assets">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={filters.q} placeholder="GIAI, serial number or model" />
        </div>
        <Select id="model" label="Model" value={filters.model} options={options.models.map((m) => [m.slug, m.name])} />
        <Select id="dept" label="Owner" value={filters.dept} options={options.departments.map((d) => [d.code, d.name])} />
        <Select id="floor" label="Floor" value={filters.floor} options={floors} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room">Room</Label>
          <select id="room" name="room" defaultValue={filters.room} className={selectClass}>
            <option value="">Any</option>
            {floors.map(([floorId, label]) => (
              <optgroup key={floorId} label={label}>
                {options.rooms.filter((r) => r.floorId === floorId).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col gap-1.5 lg:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Status</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {DISPLAY_STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" name="status" value={s} defaultChecked={filters.status.includes(s)} />
                {DISPLAY_TEXT[s]}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} />
              PPM overdue only
            </label>
          </div>
        </fieldset>
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="flex items-end gap-2 lg:col-span-4">
          <Button type="submit">Apply filters</Button>
          <Link href="/assets" className={buttonVariants({ variant: "outline" })}>Clear</Link>
        </div>
      </form>

      <section aria-label="Saved views" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Saved views:</span>
        {views.length === 0 && <span className="text-muted-foreground">None yet.</span>}
        {views.map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1 rounded-full border pl-3">
            <Link href={`/assets${v.query ? `?${v.query}` : ""}`} className="hover:underline">{v.name}</Link>
            <form action={archiveAssetView}>
              <input type="hidden" name="id" value={v.id} />
              <button type="submit" className="text-muted-foreground hover:text-foreground px-2 py-1" aria-label={`Remove saved view ${v.name}`}>×</button>
            </form>
          </span>
        ))}
        <form action={saveAssetView} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="query" value={query} />
          <Label htmlFor="view-name" className="sr-only">View name</Label>
          <Input id="view-name" name="name" placeholder="Name this view" required maxLength={60} className="w-44" />
          <Button type="submit" variant="outline">Save view</Button>
        </form>
      </section>

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {result.total} {result.total === 1 ? "asset" : "assets"}
        {result.total > PAGE_SIZE && `, page ${filters.page} of ${pages}`}
      </p>

      <AssetTable rows={result.rows} sort={filters.sort} dir={filters.dir} sortHrefs={sortHrefs} />

      {pages > 1 && <Pagination filters={filters} pages={pages} />}
    </>
  );
}

function Select({ id, label, value, options }: { id: keyof AssetFilters; label: string; value: string; options: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={id} defaultValue={value} className={selectClass}>
        <option value="">Any</option>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </div>
  );
}

function Pagination({ filters, pages }: { filters: AssetFilters; pages: number }) {
  const link = (page: number, text: string, disabled: boolean) =>
    disabled ? (
      <span className={buttonVariants({ variant: "outline", className: "pointer-events-none opacity-50" })} aria-disabled>{text}</span>
    ) : (
      <Link href={`?${filtersToQuery(filters, { page })}`} className={buttonVariants({ variant: "outline" })}>{text}</Link>
    );
  return (
    <nav aria-label="Pages" className="flex items-center gap-2">
      {link(filters.page - 1, "Previous", filters.page <= 1)}
      <span className="text-muted-foreground text-sm">Page {filters.page} of {pages}</span>
      {link(filters.page + 1, "Next", filters.page >= pages)}
    </nav>
  );
}

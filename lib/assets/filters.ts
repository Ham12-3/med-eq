// Asset register filters live in the URL, so a saved view is just a query string.

import { DISPLAY_STATUSES, type DisplayStatus } from "@/lib/rules/assetStatus";

export const SORT_KEYS = ["giai", "model", "owner", "location", "next_due", "status"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const PAGE_SIZE = 50;

export type AssetFilters = {
  q: string;
  status: DisplayStatus[];
  model: string; // device model slug
  dept: string; // owner department code
  floor: string; // floor id
  room: string; // room id
  overdue: boolean;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
};

export const DEFAULT_FILTERS: AssetFilters = {
  q: "", status: [], model: "", dept: "", floor: "", room: "", overdue: false,
  sort: "giai", dir: "asc", page: 1,
};

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,64}$/;
const CODE = /^[A-Z0-9]{1,16}$/;

/** Parses untrusted search params. Anything unrecognised falls back to the default. */
export function parseAssetFilters(params: Params): AssetFilters {
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page), 10);
  const model = first(params.model);
  const dept = first(params.dept);
  const floor = first(params.floor);
  const room = first(params.room);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: [...new Set(all(params.status))].filter((s): s is DisplayStatus => (DISPLAY_STATUSES as readonly string[]).includes(s)),
    model: SLUG.test(model) ? model : "",
    dept: CODE.test(dept) ? dept : "",
    floor: UUID.test(floor) ? floor : "",
    room: UUID.test(room) ? room : "",
    overdue: first(params.overdue) === "1",
    sort: (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : DEFAULT_FILTERS.sort,
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** The canonical query string for a set of filters, leaving out defaults. */
export function filtersToQuery(filters: AssetFilters, changes: Partial<AssetFilters> = {}): string {
  const f = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  for (const s of f.status) params.append("status", s);
  if (f.model) params.set("model", f.model);
  if (f.dept) params.set("dept", f.dept);
  if (f.floor) params.set("floor", f.floor);
  if (f.room) params.set("room", f.room);
  if (f.overdue) params.set("overdue", "1");
  if (f.sort !== DEFAULT_FILTERS.sort) params.set("sort", f.sort);
  if (f.dir !== DEFAULT_FILTERS.dir) params.set("dir", f.dir);
  if (f.page !== 1) params.set("page", String(f.page));
  return params.toString();
}

/** Clicking a column header: same column flips direction, a new column starts ascending. */
export function sortChange(filters: AssetFilters, key: SortKey): Partial<AssetFilters> {
  const dir = filters.sort === key && filters.dir === "asc" ? "desc" : "asc";
  return { sort: key, dir, page: 1 };
}

// Map filters live in the URL, so the 3D view, the counts and the list view agree.

export type MapFilters = {
  floor: string; // floor id
  model: string; // device model slug
  dept: string; // owning department code
  notice: string; // safety notice id: "Show recall" mode
};

export const NO_MAP_FILTERS: MapFilters = { floor: "", model: "", dept: "", notice: "" };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMapFilters(params: Params): MapFilters {
  const floor = first(params.floor);
  const model = first(params.model);
  const dept = first(params.dept);
  const notice = first(params.notice);
  return {
    floor: UUID.test(floor) ? floor : "",
    model: /^[a-z0-9-]{1,64}$/.test(model) ? model : "",
    dept: /^[A-Z0-9]{1,16}$/.test(dept) ? dept : "",
    notice: UUID.test(notice) ? notice : "",
  };
}

export function mapFiltersToQuery(f: MapFilters, changes: Partial<MapFilters> = {}): string {
  const merged = { ...f, ...changes };
  const params = new URLSearchParams();
  for (const key of ["floor", "model", "dept", "notice"] as const) if (merged[key]) params.set(key, merged[key]);
  return params.toString();
}

/** True when some devices are being left out, so the rest are shown greyed for context. */
export function isFiltering(f: MapFilters): boolean {
  return Boolean(f.model || f.dept || f.notice);
}

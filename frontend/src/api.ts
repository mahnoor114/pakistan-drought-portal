export interface Indicator {
  label: string;
  category: string;
  scale: "drought" | "seq" | "seq_r";
  mid?: number;
  min: number;
  max: number;
  unit: string;
  source: string;
  drought_threshold?: number;
  drought_below?: boolean;
}

export interface DistrictInfo {
  district_id: string;
  district: string;
  province: string;
}

export interface Meta {
  title: string;
  dates: string[];
  latest_date: string;
  provinces: string[];
  districts: DistrictInfo[];
  indicators: Record<string, Indicator>;
  categories: Record<string, string>;
}

export interface Series {
  dates: string[];
  series: Record<string, (number | null)[]>;
  district?: string;
  province?: string;
  name?: string;
}

export interface StatusRow extends DistrictInfo {
  met_class: number | null;
  agr_class: number | null;
  hyd_class: number | null;
  drought_class: number | null;
  alert: "Normal" | "Watch" | "Warning" | "Alert";
}

export interface RiskRow extends DistrictInfo {
  hazard: number;
  exposure: number;
  vulnerability: number;
  risk_score: number;
  risk_class: string;
  freq_spei3_drought: number;
  freq_vhi_drought: number;
  grace_trend_per_decade: number | null;
  cropland_pct: number;
  population: number | null;
  density_per_km2: number | null;
  mean_annual_rain_mm: number;
}

export interface ForecastRow extends DistrictInfo {
  lead: number;
  valid_date: string;
  value: number;
  drought: boolean;
  class: number;
}

export interface Station {
  station: string;
  river: string;
  lat: number;
  lon: number;
  mean_discharge_m3s: number;
  discharge_mean_m3s: number | null;
  sri_3: number | null;
  sri_6: number | null;
  discharge_pct_of_normal: number | null;
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  geo: () => get<GeoJSON.FeatureCollection>("/api/geo/districts"),
  map: (indicator: string, date: string) =>
    get<{ values: Record<string, number | null> }>(`/api/map?indicator=${indicator}&date=${date}`),
  district: (id: string, indicators: string[]) =>
    get<Series>(`/api/timeseries/district/${id}?indicators=${indicators.join(",")}`),
  region: (indicators: string[], level = "national", name?: string) =>
    get<Series>(
      `/api/timeseries/region?indicators=${indicators.join(",")}&level=${level}` +
        (name ? `&name=${encodeURIComponent(name)}` : ""),
    ),
  status: (date?: string) =>
    get<{ date: string; counts: Record<string, number>; districts: StatusRow[] }>(
      "/api/status" + (date ? `?date=${date}` : ""),
    ),
  trends: (indicator: string) =>
    get<{
      years: number[];
      national_pct_in_drought: number[];
      national_mean: (number | null)[];
      provinces: Record<string, (number | null)[]>;
    }>(`/api/trends?indicator=${indicator}`),
  risk: () => get<{ method: string; districts: RiskRow[] }>("/api/risk"),
  forecast: (target: string) =>
    get<{ issued_from: string; valid_dates: string[]; districts: ForecastRow[] }>(
      `/api/forecast?target=${target}`,
    ),
  skill: () => get<any>("/api/forecast/skill"),
  rivers: (date?: string) =>
    get<{ date: string; stations: Station[] }>("/api/rivers" + (date ? `?date=${date}` : "")),
  river: (station: string) => get<any>(`/api/rivers/${encodeURIComponent(station)}`),
  events: () => get<{ events: any[] }>("/api/events"),

  // groundwater (GRACE) and reservoirs (Landsat)
  gwMeta: () => get<{ dates: string[]; variables: Record<string, VarInfo>; source: string }>("/api/groundwater/meta"),
  gwMap: (date: string, v: string) =>
    get<{ values: Record<string, number | null> }>(`/api/groundwater/map?date=${date}&var=${v}`),
  gwDistrict: (id: string) => get<Series>(`/api/groundwater/district/${id}`),
  gwNational: () => get<Series>("/api/groundwater/national"),
  reservoirs: (date?: string) =>
    get<{ date: string; reservoirs: Reservoir[] }>("/api/reservoirs" + (date ? `?date=${date}` : "")),
  reservoir: (name: string) =>
    get<Series & { quality: string[]; platform: string[] }>(`/api/reservoirs/${encodeURIComponent(name)}`),

  // impacts
  ipcPeriods: () => get<{ periods: IpcPeriod[] }>("/api/impacts/ipc/periods"),
  ipc: (p: IpcPeriod) =>
    get<{ districts: IpcRow[] }>(
      `/api/impacts/ipc?analysis=${encodeURIComponent(p.analysis)}&validity=${encodeURIComponent(p.validity)}&period_from=${p.period_from}`,
    ),
  ipcDistrict: (id: string) => get<{ history: IpcRow[]; ipc_areas: { ipc_area: string; match: string }[] }>(`/api/impacts/ipc/district/${id}`),
  asap: () => get<{ rows: AsapRow[] }>("/api/impacts/asap"),
  gdacs: () => get<{ rows: any[] }>("/api/impacts/gdacs"),

  // crops and population
  cropsNational: () =>
    get<{ source: string; crops: Record<string, { years: number[]; area_ha: Num[]; production_t: Num[]; yield_kg_ha: Num[] }> }>(
      "/api/crops/national",
    ),
  cropsMap: (crop: string, year: number) =>
    get<{ years: number[]; yield_t_ha: Record<string, Num>; anomaly_pct: Record<string, Num>; cropland_pct: Record<string, Num> }>(
      `/api/crops/map?crop=${crop}&year=${year}`,
    ),
  cropsDistrict: (id: string) =>
    get<{ gdhy: { years: number[]; wheat: Num[]; rice: Num[]; maize: Num[]; cropland_pct: Num }; punjab_wheat: any[] }>(
      `/api/crops/district/${id}`,
    ),
  population: (id: string) => get<any>(`/api/population/district/${id}`),

  // projections
  projMeta: () => get<ProjMeta>("/api/projections/meta"),
  projDistrict: (id: string, variable: string) =>
    get<{ label: string; unit: string; scenarios: Record<string, { years: number[]; mean: Num[]; min: Num[]; max: Num[] }> }>(
      `/api/projections/district/${id}?variable=${variable}`,
    ),
  projMap: (variable: string, scenario: string, start: number, end: number) =>
    get<{ change: Record<string, Num>; baseline_value: Record<string, Num>; change_unit: string; label: string }>(
      `/api/projections/map?variable=${variable}&scenario=${scenario}&start=${start}&end=${end}`,
    ),
  projNational: (variable: string) =>
    get<{ description: string; scenarios: Record<string, { years: number[]; median?: Num[]; p10?: Num[]; p90?: Num[] }> }>(
      `/api/projections/national?variable=${variable}`,
    ),

  cultivation: () => get<Cultivation>("/api/cultivation"),

  // map layers (any district table)
  layers: () => get<{ groups: { group: string; tables: LayerTable[] }[] }>("/api/layers"),
  layerTimes: (l: LayerRef) => get<{ time: string; steps: string[] }>(`/api/layers/times?${layerParams(l)}`),
  layerValues: (l: LayerRef, when?: string) =>
    get<{ values: Record<string, Num>; stats: LayerStats | null; dimensions: Record<string, string> }>(
      `/api/layers/values?${layerParams(l)}${when ? `&when=${when}` : ""}`,
    ),
  layerSeries: (l: LayerRef, districtId: string) =>
    get<{ time: string; dates: string[]; values: Num[] }>(`/api/layers/series?${layerParams(l)}&district_id=${districtId}`),
  districtProfile: (id: string) => get<Record<string, any>>(`/api/districts/${id}/profile`),
  provinces: () => get<GeoJSON.FeatureCollection>("/api/geo/provinces"),

  // data explorer
  catalog: () => get<{ schema: string; tables: CatalogTable[] }>("/api/catalog"),
  data: (table: string, params: URLSearchParams) => get<DataPage>(`/api/data/${table}?${params}`),
  distinct: (table: string, column: string) => get<{ values: any[] }>(`/api/data/${table}/distinct/${column}`),
};

export type Num = number | null;

export interface CultivationDistrict extends DistrictInfo {
  lat: number;
  lon: number;
  cropland_pct: number;
  cropland_km2: number;
  alert: string | null;
  vhi_cropland: Num;
  wheat: Num;
  rice: Num;
  maize: Num;
}

export interface Cultivation {
  status_date: string;
  vhi_date: string;
  yield_year: number;
  crop_year: number;
  cropland_km2: number;
  cropland_in_drought_pct: number;
  districts: CultivationDistrict[];
  provinces: { province: string; cropland_km2: number }[];
  crops: { crop: string; area_ha: Num; production_t: Num; yield_kg_ha: Num }[];
}

export interface LayerTable {
  table: string;
  group: string;
  time: "monthly" | "yearly" | "static";
  span: [number, number] | null;
  dimensions: Record<string, string[]>;
  columns: { name: string; label: string }[];
}

export interface LayerRef {
  table: string;
  column: string;
  dims: Record<string, string>;
}

export interface LayerStats {
  min: number;
  p02: number;
  median: number;
  p98: number;
  max: number;
}

function layerParams(l: LayerRef) {
  const p = new URLSearchParams({ table: l.table, column: l.column });
  Object.entries(l.dims).forEach(([k, v]) => p.append("dim", `${k}:${v}`));
  return p.toString();
}

export interface VarInfo {
  label: string;
  unit: string;
  scale: "drought" | "seq" | "seq_r";
  mid?: number;
  min: number;
  max: number;
  drought_threshold?: number;
}

export interface Reservoir {
  reservoir: string;
  lon: number;
  lat: number;
  max_extent_km2: number;
  median_area_km2: number;
  first: string;
  last: string;
  months: number;
  scene_date: string | null;
  water_area_km2: number | null;
  water_pct_of_max: number | null;
  area_anomaly_pct: number | null;
  quality: string | null;
}

export interface IpcPeriod {
  analysis: string;
  validity: string;
  period_from: string;
  period_to: string;
  districts: number;
  pop_phase3plus: number;
}

export interface IpcRow extends DistrictInfo {
  analysis: string;
  validity: string;
  period_from: string;
  period_to: string;
  pop_analysed: Num;
  pop_phase1: Num;
  pop_phase2: Num;
  pop_phase3: Num;
  pop_phase4: Num;
  pop_phase5: Num;
  pop_phase3plus: Num;
  pct_phase3plus: Num;
}

export interface AsapRow {
  date: string;
  hotspot_code: number;
  hotspot: string;
  n_provinces_crop_warning: number;
  n_provinces_rangeland_warning: number;
  n_provinces_any_warning: number;
  comment: string;
}

export interface ProjMeta {
  isimip_variables: Record<string, { label: string; unit: string }>;
  scenarios: Record<string, string>;
  models: string[];
  baseline: [number, number];
  cckp_variables: { variable: string; description: string; scenarios: string[] }[];
}

export interface CatalogTable {
  table_name: string;
  rows: number | null;
  columns: number;
  source: string;
  description: string;
  group: string;
  column_list: { name: string; type: string }[];
}

export interface DataPage {
  table: string;
  total: number;
  limit: number;
  offset: number;
  columns: { name: string; type: string }[];
  rows: Record<string, any>[];
}

/** Indicator-shaped object for colorFor / legendStops from a VarInfo. */
export function asIndicator(v: Pick<VarInfo, "scale" | "min" | "max" | "mid" | "unit"> & { label?: string }): Indicator {
  return { label: v.label ?? "", category: "", source: "", ...v };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, asIndicator, type Cultivation, type CultivationDistrict, type Meta, type Num, type Reservoir } from "../api";
import { ALERT_COLORS, colorFor, fmt } from "../colors";
import { Legend, MapView, type MapPoint } from "../components/MapView";

interface Props {
  meta: Meta;
  geo: GeoJSON.FeatureCollection | null;
  go: (page: string) => void;
}

const MODES = [
  ["cropland", "Cultivated land"],
  ["health", "Crop health"],
  ["status", "Drought status"],
  ["wheat", "Wheat"],
  ["rice", "Rice"],
  ["maize", "Maize"],
] as const;
type Mode = (typeof MODES)[number][0];

const CROPLAND = asIndicator({ label: "Cultivated land", scale: "seq", min: 0, max: 90, unit: "%" });
const HEALTH = asIndicator({ label: "Crop health (VHI)", scale: "drought", mid: 0.4, min: 0, max: 0.8, unit: "0-1" });
const YIELD = asIndicator({ label: "Yield", scale: "seq", min: 0, max: 5, unit: "t/ha" });
const CROP_NAMES: Record<string, string> = { "Maize (corn)": "Maize", "Sugar cane": "Sugarcane", "Seed cotton, unginned": "Cotton" };
const MARKED = 12; // labelled top farming districts

export function Home({ meta, geo, go }: Props) {
  const [c, setC] = useState<Cultivation | null>(null);
  const [mode, setMode] = useState<Mode>("cropland");
  const [selected, setSelected] = useState<string | null>(null);
  const [provinces, setProvinces] = useState<GeoJSON.FeatureCollection | null>(null);
  const [res, setRes] = useState<Reservoir[]>([]);
  const [forecast, setForecast] = useState<{ n: number; date: string } | null>(null);
  const [spei, setSpei] = useState<{ v: Num; date: string } | null>(null);

  useEffect(() => {
    api.cultivation().then(setC).catch(() => {});
    api.provinces().then(setProvinces).catch(() => {});
    api.reservoirs().then((r) => setRes(r.reservoirs)).catch(() => {});
    api.forecast("spei_3").then((f) => {
      const next = f.districts.filter((d) => d.lead === 1);
      setForecast({ n: next.filter((d) => d.drought).length, date: f.valid_dates[0] });
    }).catch(() => {});
    api.region(["spei_3"]).then((r) => {
      const v = r.series.spei_3;
      for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null) return setSpei({ v: v[i], date: r.dates[i] });
    }).catch(() => {});
  }, []);

  const byId = useMemo(() => Object.fromEntries((c?.districts ?? []).map((d) => [d.district_id, d])), [c]);
  const top = useMemo(() => [...(c?.districts ?? [])].sort((a, b) => b.cropland_km2 - a.cropland_km2), [c]);

  const valueOf = useCallback((d?: CultivationDistrict): Num => {
    if (!d) return null;
    if (mode === "cropland") return d.cropland_pct;
    if (mode === "health") return d.vhi_cropland;
    if (mode === "wheat" || mode === "rice" || mode === "maize") return d[mode];
    return null;
  }, [mode]);

  const colorOf = useCallback((id: string) => {
    const d = byId[id];
    if (mode === "status") return ALERT_COLORS[d?.alert ?? "Normal"];
    return colorFor(valueOf(d), mode === "cropland" ? CROPLAND : mode === "health" ? HEALTH : YIELD);
  }, [byId, mode, valueOf]);

  // low relief so the markers stay visible
  const heightOf = useCallback((id: string) => 0.02 + 0.1 * Math.min(1, (byId[id]?.cropland_pct ?? 0) / 90), [byId]);

  const tooltipOf = useCallback((id: string, name: string, prov: string) => {
    const d = byId[id];
    if (!d) return `<b>${name}</b> (${prov})`;
    return `<b>${name}</b> (${prov})<br/>Cultivated: ${fmt(d.cropland_km2, 0)} km² (${fmt(d.cropland_pct, 0)}%)` +
      `<br/>Crop health: ${fmt(d.vhi_cropland)}<br/>Status: ${d.alert ?? "–"}`;
  }, [byId]);

  const points: MapPoint[] = useMemo(() => [
    ...top.slice(0, MARKED).map((d, i) => ({
      id: d.district_id, lon: d.lon, lat: d.lat, color: "#16a34a", radius: 5 + Math.sqrt(d.cropland_km2) / 16,
      label: d.district,
      html: `<b>#${i + 1} ${d.district}</b><br/>${fmt(d.cropland_km2, 0)} km² cultivated`,
    })),
    ...res.map((r) => ({
      id: r.reservoir, lon: r.lon, lat: r.lat, color: "#2563eb", radius: 6, label: r.reservoir,
      html: `<b>${r.reservoir} reservoir</b><br/>Water area: ${fmt(r.water_area_km2, 0)} km² (${fmt(r.water_pct_of_max, 0)}% of max)`,
    })),
  ], [top, res]);

  const legend = mode === "status"
    ? { title: `Drought status · ${c?.status_date ?? ""}`, items: Object.entries(ALERT_COLORS).reverse().map(([k, v]) => ({ color: v, label: k })) }
    : mode === "cropland"
      ? { title: "Cultivated land (% of district)", items: [0, 20, 40, 60, 80].map((v) => ({ color: colorFor(v, CROPLAND), label: `${v}%` })) }
      : mode === "health"
        ? { title: `Crop health (VHI) · ${c?.vhi_date ?? ""}`, items: [0.1, 0.3, 0.4, 0.6].map((v) => ({ color: colorFor(v, HEALTH), label: v <= 0.4 ? `${v} dry` : `${v} healthy` })) }
        : { title: `${mode} yield (t/ha) · ${c?.yield_year ?? ""}`, items: [1, 2, 3, 4, 5].map((v) => ({ color: colorFor(v, YIELD), label: String(v) })) };

  const inDrought = (c?.districts ?? []).filter((d) => d.alert === "Alert" || d.alert === "Warning").length;
  const tarbela = res.find((r) => r.reservoir === "Tarbela");
  const maxProd = Math.max(1, ...(c?.crops ?? []).map((x) => x.area_ha ?? 0));
  const maxProv = Math.max(1, ...(c?.provinces ?? []).map((p) => p.cropland_km2));
  const sel = selected ? byId[selected] : null;

  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-kpis">
          <Kpi label={`Forecast ${forecast?.date ?? "next month"}`} value={forecast ? String(forecast.n) : "–"} note="districts in drought" color="#c2410c" onClick={() => go("forecast")} />
          <Kpi label={`Drought now · ${c?.status_date ?? ""}`} value={c ? String(inDrought) : "–"} note="of 126 districts" color="#f59e0b" onClick={() => go("overview")} />
          <Kpi label="Cultivated land" value={c ? `${fmt(c.cropland_km2 / 1000, 0)}k` : "–"} note="km² (ESA WorldCover)" color="#16a34a" onClick={() => setMode("cropland")} />
          <Kpi label="Cropland in drought" value={c ? `${fmt(c.cropland_in_drought_pct, 0)}%` : "–"} note="Alert + Warning" color="#b91c1c" onClick={() => setMode("status")} />
          <Kpi label="National SPEI-3" value={fmt(spei?.v)} note={spei ? `${spei.date} · ≤ −1 drought` : ""} color="#2563eb" onClick={() => go("monitor")} />
          <Kpi label="Tarbela water area" value={tarbela?.water_pct_of_max == null ? "–" : `${fmt(tarbela.water_pct_of_max, 0)}%`} note="of maximum" color="#0891b2" onClick={() => go("water")} />
        </div>
        <h3>Cultivated land by province</h3>
        {(c?.provinces ?? []).filter((p) => p.cropland_km2 >= 100).map((p) => (
          <div key={p.province} className="barline">
            <span className="barline-name">{p.province.replace("Khyber Pakhtunkhwa", "KP").replace("Islamabad Capital Territory", "Islamabad")}</span>
            <span className="barline-track"><span style={{ width: `${(p.cropland_km2 / maxProv) * 100}%`, background: "#16a34a" }} /></span>
            <span className="barline-val">{fmt(p.cropland_km2 / 1000, 0)}k</span>
          </div>
        ))}
        <div className="dash-links">
          <button className="btn primary" onClick={() => go("forecast")}>Drought forecast →</button>
          <button className="btn" onClick={() => go("map")}>All data map</button>
        </div>
      </aside>

      <section className="dash-map">
        <div className="dash-modes tabs small">
          {MODES.map(([k, v]) => <button key={k} className={k === mode ? "active" : ""} onClick={() => setMode(k)}>{v}</button>)}
        </div>
        <MapView geo={geo} provinces={provinces} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf}
          selected={selected} onSelect={setSelected} points={points} selectedPoint={selected ?? undefined}
          onPointClick={(id) => { if (byId[id]) setSelected(id); }} version={`home-${mode}-${c ? 1 : 0}`}>
          <Legend title={legend.title} items={legend.items} hint="● top farming districts   ● reservoirs" />
        </MapView>
      </section>

      <aside className="dash-side">
        {sel ? (
          <>
            <h2>{sel.district}</h2>
            <div className="muted">{sel.province} · <button className="link" onClick={() => setSelected(null)}>back</button></div>
            <table className="kv">
              <tbody>
                <tr><td>Cultivated land</td><td>{fmt(sel.cropland_km2, 0)} km²</td></tr>
                <tr><td>Share of district</td><td>{fmt(sel.cropland_pct, 0)}%</td></tr>
                <tr><td>Crop health ({c?.vhi_date})</td><td>{fmt(sel.vhi_cropland)}</td></tr>
                <tr><td>Drought status</td><td>{sel.alert ?? "–"}</td></tr>
                <tr><td>Wheat ({c?.yield_year})</td><td>{fmt(sel.wheat)} t/ha</td></tr>
                <tr><td>Rice ({c?.yield_year})</td><td>{fmt(sel.rice)} t/ha</td></tr>
                <tr><td>Maize ({c?.yield_year})</td><td>{fmt(sel.maize)} t/ha</td></tr>
              </tbody>
            </table>
            <p className="note">Yields are modelled (GDHY) and hidden where under 5% of the district is cropland.</p>
            <div className="dash-links"><button className="btn" onClick={() => go("crops")}>Crop history →</button></div>
          </>
        ) : (
          <>
            <h3>Crops grown · {c?.crop_year ?? ""} (area)</h3>
            {(c?.crops ?? []).map((x) => (
              <div key={x.crop} className="barline" title={`${fmt((x.production_t ?? 0) / 1e6, 1)} million tonnes`}>
                <span className="barline-name">{CROP_NAMES[x.crop] ?? x.crop}</span>
                <span className="barline-track"><span style={{ width: `${((x.area_ha ?? 0) / maxProd) * 100}%`, background: "#f59e0b" }} /></span>
                <span className="barline-val">{fmt((x.area_ha ?? 0) / 1e6, 1)} Mha</span>
              </div>
            ))}
            <h3>Top farming districts</h3>
            <div className="dash-list">
              {top.slice(0, MARKED).map((d, i) => (
                <button key={d.district_id} onClick={() => setSelected(d.district_id)}>
                  <span className="rank">{i + 1}</span>
                  <span className="name">{d.district}</span>
                  <span className="pill" style={{ background: ALERT_COLORS[d.alert ?? "Normal"] }}>{d.alert ?? "–"}</span>
                  <span className="muted">{fmt(d.cropland_km2 / 1000, 1)}k</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Kpi(p: { label: string; value: string; note: string; color: string; onClick: () => void }) {
  return (
    <button className="dkpi" style={{ borderLeftColor: p.color }} onClick={p.onClick}>
      <span className="dkpi-label">{p.label}</span>
      <span className="dkpi-value">{p.value}</span>
      <span className="dkpi-note">{p.note}</span>
    </button>
  );
}

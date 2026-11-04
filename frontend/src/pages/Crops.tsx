import { useCallback, useEffect, useMemo, useState } from "react";
import { api, asIndicator, type Meta, type Num } from "../api";
import { colorFor, fmt, heightFor, legendStops } from "../colors";
import { Legend, MapView } from "../components/MapView";
import { SeriesChart } from "../components/SeriesChart";

const ANOM = asIndicator({ label: "Yield anomaly", scale: "drought", mid: 0, min: -40, max: 40, unit: "% vs district mean" });
const CROPS = ["wheat", "rice", "maize"] as const;
const METRICS = { yield_kg_ha: "Yield (kg/ha)", production_t: "Production (t)", area_ha: "Area harvested (ha)" } as const;

export function Crops({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [crop, setCrop] = useState<(typeof CROPS)[number]>("wheat");
  const [year, setYear] = useState(2016);
  const [map, setMap] = useState<{ years: number[]; yield_t_ha: Record<string, Num>; anomaly_pct: Record<string, Num>; cropland_pct: Record<string, Num> } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dist, setDist] = useState<Awaited<ReturnType<typeof api.cropsDistrict>> | null>(null);
  const [nat, setNat] = useState<Awaited<ReturnType<typeof api.cropsNational>> | null>(null);
  const [natCrops, setNatCrops] = useState<string[]>(["Wheat", "Rice", "Maize (corn)"]);
  const [metric, setMetric] = useState<keyof typeof METRICS>("yield_kg_ha");

  useEffect(() => {
    api.cropsMap(crop, year).then(setMap);
  }, [crop, year]);
  useEffect(() => {
    if (selected) api.cropsDistrict(selected).then(setDist);
    else setDist(null);
  }, [selected]);
  useEffect(() => {
    api.cropsNational().then(setNat);
  }, []);

  const colorOf = useCallback((id: string) => colorFor(map?.anomaly_pct[id], ANOM), [map]);
  const heightOf = useCallback((id: string) => heightFor(map?.anomaly_pct[id], ANOM), [map]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) =>
      `<b>${name}</b> (${prov})<br/>${crop} ${year}: ${fmt(map?.yield_t_ha[id])} t/ha<br/>vs district mean: ${fmt(map?.anomaly_pct[id], 0)}%` +
      `<br/>Cropland: ${fmt(map?.cropland_pct[id], 0)}% of district${(map?.cropland_pct[id] ?? 100) < 5 ? " (low confidence)" : ""}`,
    [map, crop, year],
  );

  const natSeries = useMemo(() => {
    if (!nat) return null;
    const years = nat.crops["Wheat"].years.map(String);
    return { dates: years, series: Object.fromEntries(natCrops.map((c) => [c, nat.crops[c]?.[metric] ?? []])) };
  }, [nat, natCrops, metric]);

  const sel = meta.districts.find((d) => d.district_id === selected);
  const pw = dist?.punjab_wheat ?? [];

  return (
    <>
      <div className="split">
        <section className="panel map-panel">
          <div className="toolbar row">
            <div className="tabs small">
              {CROPS.map((c) => (
                <button key={c} className={c === crop ? "active" : ""} onClick={() => setCrop(c)}>{c}</button>
              ))}
            </div>
            <input type="range" min={map?.years[0] ?? 1982} max={map?.years.at(-1) ?? 2016} value={year} onChange={(e) => setYear(+e.target.value)} className="grow" />
            <strong className="date">{year}</strong>
          </div>
          <div className="map-wrap">
            <MapView geo={geo} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf} selected={selected} onSelect={setSelected} version={`crop-${crop}-${year}-${map ? 1 : 0}`}>
              <Legend title={`${crop} yield vs district mean (%)`} items={legendStops(ANOM)} />
              <div className="map-date">{year}</div>
            </MapView>
          </div>
          <p className="note">
            GDHY gridded yields (Iizumi &amp; Sakai, 0.5°, 1981–2016): use them for year-to-year anomalies, not absolute yields.
            Values are unreliable in hilly districts with little cropland. Red = lower yield than usual.
          </p>
        </section>

        <section className="panel side">
          <h2>{sel ? `${sel.district}, ${sel.province}` : "Click a district"}</h2>
          {dist && (
            <>
              <h3>GDHY yields (t/ha)</h3>
              <SeriesChart dates={dist.gdhy.years.map(String)} series={{ wheat: dist.gdhy.wheat, rice: dist.gdhy.rice, maize: dist.gdhy.maize }} />
              <p className="note">Cropland: {fmt(dist.gdhy.cropland_pct, 0)}% of the district (ESA WorldCover).</p>
              {pw.length > 0 && (
                <>
                  <h3>Punjab statistics – wheat yield (kg/ha)</h3>
                  <SeriesChart dates={pw.map((r) => String(r.year))} series={{ y: pw.map((r) => r.wheat_yield_kg_ha) }} labels={{ y: "reported yield" }} />
                  <p className="note">Bureau of Statistics Punjab via opendata.com.pk (harvest year). Sources: {pw[0].source_districts}.</p>
                </>
              )}
            </>
          )}
          <h3>Pakistan – FAOSTAT</h3>
          <div className="row">
            <select value={metric} onChange={(e) => setMetric(e.target.value as keyof typeof METRICS)}>
              {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select multiple value={natCrops} onChange={(e) => setNatCrops([...e.target.selectedOptions].map((o) => o.value))} className="grow" size={4}>
              {nat && Object.keys(nat.crops).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {natSeries && <SeriesChart dates={natSeries.dates} series={natSeries.series} height={240} />}
          <p className="note">National statistics 1961–2024. Hold Ctrl to pick several crops.</p>
        </section>
      </div>
    </>
  );
}

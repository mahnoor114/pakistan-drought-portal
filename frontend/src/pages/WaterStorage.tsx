import { useCallback, useEffect, useMemo, useState } from "react";
import { api, asIndicator, type Meta, type Reservoir, type Series, type VarInfo } from "../api";
import { colorFor, fmt, heightFor, legendStops } from "../colors";
import { Legend, MapView, type MapPoint } from "../components/MapView";
import { SeriesChart } from "../components/SeriesChart";

const FILL = asIndicator({ label: "% of max extent", scale: "seq", min: 0, max: 100, unit: "%" });

export function WaterStorage({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [gw, setGw] = useState<{ dates: string[]; variables: Record<string, VarInfo>; source: string } | null>(null);
  const [v, setV] = useState("ggdi");
  const [dateIdx, setDateIdx] = useState(0);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [res, setRes] = useState<Reservoir[]>([]);
  const [resName, setResName] = useState("Tarbela");
  const [resTs, setResTs] = useState<(Series & { quality: string[] }) | null>(null);

  useEffect(() => {
    api.gwMeta().then((m) => {
      setGw(m);
      // start at the last month that also has reservoir data (Landsat ends 2025-12)
      const i = m.dates.lastIndexOf("2025-12");
      setDateIdx(i >= 0 ? i : m.dates.length - 1);
    });
  }, []);

  const date = gw?.dates[dateIdx];
  const info = gw?.variables[v];
  const ind = useMemo(() => (info ? asIndicator(info) : null), [info]);

  useEffect(() => {
    if (date) api.gwMap(date, v).then((r) => setValues(r.values)).catch(() => setValues({}));
  }, [date, v]);
  useEffect(() => {
    if (date) api.reservoirs(date).then((r) => setRes(r.reservoirs));
  }, [date]);
  useEffect(() => {
    (selected ? api.gwDistrict(selected) : api.gwNational()).then(setSeries).catch(() => setSeries(null));
  }, [selected]);
  useEffect(() => {
    api.reservoir(resName).then(setResTs);
  }, [resName]);

  const colorOf = useCallback((id: string) => (ind ? colorFor(values[id], ind) : "#999"), [values, ind]);
  const heightOf = useCallback((id: string) => (ind ? heightFor(values[id], ind) : 0.01), [values, ind]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) => `<b>${name}</b> (${prov})<br/>${info?.label}: ${fmt(values[id])} ${info?.unit ?? ""}`,
    [values, info],
  );
  const points: MapPoint[] = useMemo(
    () =>
      res.map((r) => ({
        id: r.reservoir,
        lon: r.lon,
        lat: r.lat,
        color: colorFor(r.water_pct_of_max, FILL),
        radius: 6 + Math.sqrt(r.max_extent_km2) / 2,
        pulse: r.area_anomaly_pct !== null && r.area_anomaly_pct <= -25,
        html:
          `<b>${r.reservoir} reservoir</b><br/>` +
          (r.water_area_km2 === null
            ? "No clear Landsat scene this month"
            : `Water area: ${fmt(r.water_area_km2, 1)} km² (${fmt(r.water_pct_of_max, 0)}% of max)<br/>` +
              `vs normal for the month: ${fmt(r.area_anomaly_pct, 0)}%<br/>Scene ${r.scene_date}${r.quality !== "good" ? " · low quality" : ""}`),
      })),
    [res],
  );

  if (!gw || !ind || !date) return <div className="loading">Loading…</div>;
  const sel = meta.districts.find((d) => d.district_id === selected);

  return (
    <>
      <div className="split">
        <section className="panel map-panel">
          <div className="toolbar">
            <div className="row">
              <select value={v} onChange={(e) => setV(e.target.value)}>
                {Object.entries(gw.variables).map(([k, x]) => (
                  <option key={k} value={k}>{x.label}</option>
                ))}
              </select>
              <input type="range" min={0} max={gw.dates.length - 1} value={dateIdx} onChange={(e) => setDateIdx(+e.target.value)} className="grow" />
              <strong className="date">{date}</strong>
            </div>
          </div>
          <div className="map-wrap">
            <MapView
              geo={geo}
              colorOf={colorOf}
              heightOf={heightOf}
              tooltipOf={tooltipOf}
              selected={selected}
              onSelect={setSelected}
              points={points}
              selectedPoint={resName}
              onPointClick={setResName}
              version={`gw-${v}-${date}-${Object.keys(values).length}`}
            >
              <Legend title={`${ind.label} (${ind.unit})`} items={legendStops(ind)} />
              <div className="map-date">{date}</div>
            </MapView>
          </div>
          <p className="note">
            {gw.source} GRACE resolution is ~300 km, so neighbouring districts share signal. Circles: reservoirs, coloured by water
            area as % of the maximum extent (Landsat); pulsing = 25 % or more below normal for the month. Click a district or a reservoir.
          </p>
        </section>

        <section className="panel side">
          <h2>{sel ? `${sel.district}, ${sel.province}` : "Pakistan (area-weighted)"}</h2>
          {sel && <button className="link" onClick={() => setSelected(null)}>← back to national view</button>}
          {series && (
            <>
              <h3>Water storage anomalies (mm, vs 2004–2009)</h3>
              <SeriesChart
                dates={series.dates}
                series={Object.fromEntries(Object.entries(series.series).filter(([k]) => k !== "ggdi"))}
                labels={{ csr_tws_anomaly_mm: "Total water storage", gwsa_tc_mm: "Groundwater (TerraClimate)", gwsa_cpc_mm: "Groundwater (CPC)" }}
              />
              {series.series.ggdi && (
                <>
                  <h3>Groundwater drought index</h3>
                  <SeriesChart dates={series.dates} series={{ ggdi: series.series.ggdi }} labels={{ ggdi: "GGDI" }} threshold={-1} />
                </>
              )}
            </>
          )}
          <h3>Reservoir</h3>
          <select value={resName} onChange={(e) => setResName(e.target.value)}>
            {res.map((r) => <option key={r.reservoir}>{r.reservoir}</option>)}
          </select>
          {resTs && (
            <>
              <h3>Water surface area (km²)</h3>
              <SeriesChart dates={resTs.dates} series={{ a: resTs.series.water_area_km2 }} labels={{ a: `${resName} water area` }} />
              <h3>Area vs normal for the month (%)</h3>
              <SeriesChart dates={resTs.dates} series={{ x: resTs.series.area_anomaly_pct }} labels={{ x: "anomaly %" }} threshold={-25} />
              <p className="note">
                {resTs.quality.filter((q) => q !== "good").length} of {resTs.dates.length} months are low quality (Landsat 7 scan-line gaps).
                Area is a proxy for storage, not a level.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

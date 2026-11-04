import { useCallback, useEffect, useMemo, useState } from "react";
import { api, asIndicator, type LayerRef, type LayerStats, type LayerTable, type Meta, type Num } from "../api";
import { colorFor, fmt, heightFor, legendStops } from "../colors";
import { Legend, MapView } from "../components/MapView";
import { SeriesChart } from "../components/SeriesChart";

const DEFAULT: LayerRef = { table: "spi_spei_district", column: "spei_3", dims: {} };

/** Colour scale from the values' spread: diverging around 0 when values cross zero, else sequential. */
function scaleFor(stats: LayerStats | null, reverse: boolean) {
  if (!stats) return asIndicator({ scale: "seq", min: 0, max: 1, unit: "" });
  const lo = stats.p02, hi = stats.p98 === stats.p02 ? stats.p02 + 1 : stats.p98;
  if (lo < 0 && hi > 0) {
    const m = Math.max(-lo, hi);
    return asIndicator({ scale: "drought", mid: 0, min: reverse ? m : -m, max: reverse ? -m : m, unit: "" });
  }
  return asIndicator({ scale: reverse ? "seq_r" : "seq", min: lo, max: hi, unit: "" });
}

export function PakistanMap({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [groups, setGroups] = useState<{ group: string; tables: LayerTable[] }[]>([]);
  const [layer, setLayer] = useState<LayerRef>(DEFAULT);
  const [steps, setSteps] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState<Record<string, Num>>({});
  const [stats, setStats] = useState<LayerStats | null>(null);
  const [reverse, setReverse] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [series, setSeries] = useState<{ dates: string[]; values: Num[] } | null>(null);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [provinces, setProvinces] = useState<GeoJSON.FeatureCollection | null>(null);
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    api.layers().then((r) => setGroups(r.groups));
    api.provinces().then(setProvinces).catch(() => setProvinces(null));
  }, []);

  const tableInfo = useMemo(() => groups.flatMap((g) => g.tables).find((t) => t.table === layer.table), [groups, layer.table]);
  const when = steps[idx];

  // time steps for the layer (newest selected)
  useEffect(() => {
    api.layerTimes(layer).then((r) => {
      setSteps(r.steps);
      setIdx(Math.max(0, r.steps.length - 1));
    }).catch(() => setSteps([]));
  }, [layer]);

  useEffect(() => {
    if (tableInfo && tableInfo.time !== "static" && !when) return;
    api.layerValues(layer, when).then((r) => {
      setValues(r.values);
      setStats(r.stats);
    }).catch(() => setValues({}));
  }, [layer, when, tableInfo]);

  useEffect(() => {
    if (!selected) return setSeries(null);
    api.layerSeries(layer, selected).then(setSeries).catch(() => setSeries(null));
  }, [layer, selected]);

  useEffect(() => {
    if (selected) api.districtProfile(selected).then(setProfile).catch(() => setProfile(null));
    else setProfile(null);
  }, [selected]);

  useEffect(() => {
    if (!playing) return;
    const tm = setInterval(() => setIdx((i) => {
      if (i >= steps.length - 1) { setPlaying(false); return i; }
      return i + 1;
    }), 700);
    return () => clearInterval(tm);
  }, [playing, steps.length]);

  const ind = useMemo(() => scaleFor(stats, reverse), [stats, reverse]);
  const colorOf = useCallback((id: string) => colorFor(values[id], ind), [values, ind]);
  const heightOf = useCallback((id: string) => heightFor(values[id], ind), [values, ind]);
  const label = tableInfo?.columns.find((c) => c.name === layer.column)?.label ?? layer.column;
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) => `<b>${name}</b> (${prov})<br/>${label}: <b>${fmt(values[id])}</b>${when ? `<br/>${when}` : ""}`,
    [values, label, when],
  );

  const pick = (table: LayerTable, column: string) => {
    const dims = Object.fromEntries(Object.entries(table.dimensions).map(([k, v]) => [k, v.includes("ssp585") ? "ssp585" : v[0]]));
    setLayer({ table: table.table, column, dims });
  };

  const ranked = useMemo(() => {
    const byId = Object.fromEntries(meta.districts.map((d) => [d.district_id, d]));
    return Object.entries(values).filter(([, v]) => v !== null)
      .map(([id, v]) => ({ id, v: v as number, d: byId[id] })).filter((r) => r.d).sort((a, b) => b.v - a.v);
  }, [values, meta.districts]);

  const s = search.toLowerCase();
  const sel = meta.districts.find((d) => d.district_id === selected);

  return (
    <div className="split map-page">
      <section className="panel map-panel">
        <div className="toolbar">
          <div className="row">
            <strong className="layer-title">{label}</strong>
            <span className="muted">{layer.table}</span>
            {tableInfo && Object.entries(tableInfo.dimensions).map(([k, opts]) => (
              <select key={k} value={layer.dims[k]} onChange={(e) => setLayer({ ...layer, dims: { ...layer.dims, [k]: e.target.value } })} title={k}>
                {opts.map((o) => <option key={o} value={o}>{k}: {o}</option>)}
              </select>
            ))}
            <label className="muted check"><input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} /> reverse colours</label>
          </div>
          {steps.length > 0 && (
            <div className="row">
              <button className="play" onClick={() => { if (!playing && idx >= steps.length - 1) setIdx(0); setPlaying((p) => !p); }}>
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <input type="range" min={0} max={steps.length - 1} value={idx} onChange={(e) => setIdx(+e.target.value)} className="grow" />
              <strong className="date">{when}</strong>
            </div>
          )}
        </div>
        <div className="map-wrap">
          <MapView geo={geo} provinces={provinces} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf}
            selected={selected} onSelect={setSelected} version={`${layer.table}.${layer.column}.${JSON.stringify(layer.dims)}.${when}.${reverse}.${Object.keys(values).length}`}>
            <Legend title={label} items={legendStops(ind)} />
            {when && <div className="map-date">{when}</div>}
          </MapView>
        </div>
        <p className="note">
          Any district variable in the PostgreSQL database can be mapped: pick a layer on the right. Colours span the
          2nd–98th percentile of the current values; diverging when values cross zero. Province borders are outlined.
          Click a district for its history.
        </p>
      </section>

      <section className="panel side">
        <h2>Map layers</h2>
        <input className="text" placeholder="Search variables or tables…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="layer-list">
          {groups.map((g) => {
            const tables = g.tables.map((t) => ({ t, cols: t.columns.filter((c) => !s || `${c.label} ${t.table}`.toLowerCase().includes(s)) }))
              .filter((x) => x.cols.length);
            if (!tables.length) return null;
            return (
              <details key={g.group} open={!!s || g.tables.some((t) => t.table === layer.table)}>
                <summary>{g.group} <span className="muted">({tables.reduce((n, x) => n + x.cols.length, 0)})</span></summary>
                {tables.map(({ t, cols }) => (
                  <div key={t.table} className="layer-table">
                    <div className="layer-table-name">{t.table} <span className="muted">· {t.time}{t.span ? ` ${t.span[0]}–${t.span[1]}` : ""}</span></div>
                    <div className="chips">
                      {cols.map((c) => (
                        <button key={c.name} className={`chip ${t.table === layer.table && c.name === layer.column ? "active" : ""}`}
                          onClick={() => pick(t, c.name)}>{c.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </details>
            );
          })}
        </div>

        {sel ? (
          <>
            <h3>{sel.district}, {sel.province} <button className="link" onClick={() => setSelected(null)}>clear</button></h3>
            {profile && (
              <table className="kv">
                <tbody>
                  <tr><td>Area</td><td>{fmt(profile.area_km2, 0)} km²</td></tr>
                  {profile.population && <tr><td>Population ({profile.population_year})</td><td>{fmt(profile.population / 1e6, 2)} M</td></tr>}
                  {profile.cropland_pct !== undefined && <tr><td>Cropland</td><td>{fmt(profile.cropland_pct, 0)}%</td></tr>}
                  {profile.status && <tr><td>Drought status ({profile.status_date})</td><td>{profile.status}</td></tr>}
                  {profile.risk_class && <tr><td>Drought risk</td><td>{profile.risk_class}</td></tr>}
                </tbody>
              </table>
            )}
            {series && series.dates.length > 0 && (
              <>
                <h3>{label} – history</h3>
                <SeriesChart dates={series.dates} series={{ v: series.values }} labels={{ v: label }} height={200} />
              </>
            )}
          </>
        ) : (
          <>
            <h3>Highest and lowest districts{when ? ` · ${when}` : ""}</h3>
            <table className="grid">
              <tbody>
                {[...ranked.slice(0, 5), ...ranked.slice(-5)].map((r, i) => (
                  <tr key={r.id + i} onClick={() => setSelected(r.id)} className={i === 5 ? "gap-row" : ""}>
                    <td>{i < 5 ? i + 1 : ranked.length - (9 - i)}</td>
                    <td>{r.d.district}<div className="muted">{r.d.province}</div></td>
                    <td style={{ textAlign: "right" }}><span className="pill" style={{ background: colorFor(r.v, ind) }}>{fmt(r.v)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

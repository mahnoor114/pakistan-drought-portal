import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend as RLegend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, asIndicator, type Meta, type Num, type ProjMeta } from "../api";
import { colorFor, fmt, heightFor, legendStops } from "../colors";
import { Legend, MapView } from "../components/MapView";

const SCEN_COLORS: Record<string, string> = { historical: "#64748b", ssp126: "#16a34a", ssp245: "#2563eb", ssp370: "#ea580c", ssp585: "#b91c1c" };
const PERIODS: [number, number][] = [[2021, 2030], [2031, 2040]];

interface Band { years: number[]; mean?: Num[]; min?: Num[]; max?: Num[]; median?: Num[]; p10?: Num[]; p90?: Num[] }

/** One line per scenario with a shaded spread (model min-max, or CCKP p10-p90). */
function ScenarioChart({ data, unit, labels }: { data: Record<string, Band>; unit: string; labels: Record<string, string> }) {
  const rows = useMemo(() => {
    const m = new Map<number, Record<string, any>>();
    for (const [s, b] of Object.entries(data)) {
      const mid = b.mean ?? b.median ?? [];
      const lo = b.min ?? b.p10 ?? [];
      const hi = b.max ?? b.p90 ?? [];
      b.years.forEach((y, i) => {
        const r = m.get(y) ?? { year: y };
        r[s] = mid[i];
        if (lo[i] !== undefined && hi[i] !== undefined && lo[i] !== null && hi[i] !== null) r[`${s}_band`] = [lo[i], hi[i]];
        m.set(y, r);
      });
    }
    return [...m.values()].sort((a, b) => a.year - b.year);
  }, [data]);
  const keys = Object.keys(data);
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#94a3b833" vertical={false} />
        <XAxis dataKey="year" minTickGap={30} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={48} unit={unit} domain={["auto", "auto"]} />
        <Tooltip formatter={(v: any) => (Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(v))} contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
        <RLegend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((s) => (
          <Area key={`${s}_band`} dataKey={`${s}_band`} stroke="none" fill={SCEN_COLORS[s] ?? "#888"} fillOpacity={0.12} legendType="none" isAnimationActive={false} />
        ))}
        {keys.map((s) => (
          <Line key={s} dataKey={s} name={labels[s] ?? s} stroke={SCEN_COLORS[s] ?? "#888"} dot={false} strokeWidth={1.6} isAnimationActive animationDuration={800} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Projections({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [pm, setPm] = useState<ProjMeta | null>(null);
  const [variable, setVariable] = useState("tas_c");
  const [scenario, setScenario] = useState("ssp585");
  const [period, setPeriod] = useState(1);
  const [map, setMap] = useState<Awaited<ReturnType<typeof api.projMap>> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dist, setDist] = useState<Awaited<ReturnType<typeof api.projDistrict>> | null>(null);
  const [cckpVar, setCckpVar] = useState("tas");
  const [nat, setNat] = useState<Awaited<ReturnType<typeof api.projNational>> | null>(null);

  useEffect(() => {
    api.projMeta().then(setPm);
  }, []);
  useEffect(() => {
    const [a, b] = PERIODS[period];
    api.projMap(variable, scenario, a, b).then(setMap).catch(() => setMap(null));
  }, [variable, scenario, period]);
  useEffect(() => {
    if (selected) api.projDistrict(selected, variable).then(setDist);
    else setDist(null);
  }, [selected, variable]);
  useEffect(() => {
    api.projNational(cckpVar).then(setNat);
  }, [cckpVar]);

  // colour scale depends on the variable: warming = red, wetter = blue
  const ind = useMemo(() => {
    if (variable === "pr_mm") return asIndicator({ label: "Change", scale: "drought", mid: 0, min: -30, max: 30, unit: "%" });
    if (variable.startsWith("tas")) return asIndicator({ label: "Change", scale: "seq_r", min: 0, max: 2.5, unit: "°C" });
    return asIndicator({ label: "Change", scale: "drought", mid: 0, min: -3, max: 3, unit: map?.change_unit ?? "" });
  }, [variable, map?.change_unit]);

  const colorOf = useCallback((id: string) => colorFor(map?.change[id], ind), [map, ind]);
  const heightOf = useCallback((id: string) => heightFor(map?.change[id], ind), [map, ind]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) =>
      `<b>${name}</b> (${prov})<br/>${map?.label}: ${fmt(map?.change[id])} ${map?.change_unit ?? ""} change<br/>baseline ${pm?.baseline.join("–")}: ${fmt(map?.baseline_value[id])}`,
    [map, pm],
  );

  if (!pm) return <div className="loading">Loading…</div>;
  const sel = meta.districts.find((d) => d.district_id === selected);
  const [a, b] = PERIODS[period];
  const futureScen = Object.entries(pm.scenarios).filter(([k]) => k !== "historical");

  return (
    <div className="split">
      <section className="panel map-panel">
        <div className="toolbar row">
          <select value={variable} onChange={(e) => setVariable(e.target.value)}>
            {Object.entries(pm.isimip_variables).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="tabs small">
            {futureScen.map(([k, v]) => (
              <button key={k} className={k === scenario ? "active" : ""} onClick={() => setScenario(k)}>{v}</button>
            ))}
          </div>
          <select value={period} onChange={(e) => setPeriod(+e.target.value)}>
            {PERIODS.map(([x, y], i) => <option key={i} value={i}>{x}–{y}</option>)}
          </select>
        </div>
        <div className="map-wrap">
          <MapView geo={geo} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf} selected={selected} onSelect={setSelected} version={`proj-${variable}-${scenario}-${period}-${map ? 1 : 0}`}>
            <Legend title={`${map?.label ?? ""} change ${a}–${b} vs ${pm.baseline.join("–")} (${ind.unit})`} items={legendStops(ind)} />
            <div className="map-date">{a}–{b}</div>
          </MapView>
        </div>
        <p className="note">
          ISIMIP3b bias-adjusted CMIP6, {pm.models.length}-model mean ({pm.models.join(", ")}), 0.5° → districts. Precipitation change
          in %, others as differences. Click a district for annual series with the model spread.
        </p>
      </section>

      <section className="panel side">
        <h2>{sel ? `${sel.district}, ${sel.province}` : "Click a district"}</h2>
        {dist && (
          <>
            <h3>{dist.label} – annual ({dist.unit}), band = model range</h3>
            <ScenarioChart data={dist.scenarios} unit="" labels={pm.scenarios} />
          </>
        )}
        <h3>Pakistan to 2100 – World Bank CCKP (CMIP6)</h3>
        <select value={cckpVar} onChange={(e) => setCckpVar(e.target.value)}>
          {pm.cckp_variables.map((v) => <option key={v.variable} value={v.variable}>{v.description}</option>)}
        </select>
        {nat && <ScenarioChart data={nat.scenarios} unit="" labels={{ ...pm.scenarios, ssp245: "SSP2-4.5 (middle)" }} />}
        <p className="note">Line = multi-model median, band = 10th–90th percentile across models.</p>
      </section>
    </div>
  );
}

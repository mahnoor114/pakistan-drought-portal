import { useCallback, useEffect, useMemo, useState } from "react";
import { api, asIndicator, type AsapRow, type IpcPeriod, type IpcRow, type Meta } from "../api";
import { colorFor, fmt, legendStops } from "../colors";
import { Legend, MapView } from "../components/MapView";

const PCT = asIndicator({ label: "Population in IPC Phase 3+", scale: "seq_r", min: 0, max: 50, unit: "%" });
const HOTSPOT_COLORS: Record<number, string> = { 0: "#16a34a", 1: "#f59e0b", 2: "#b91c1c" };

const periodLabel = (p: IpcPeriod) => `${p.period_from} → ${p.period_to} · ${p.validity} (analysis ${p.analysis})`;
const periodKey = (p: IpcPeriod) => `${p.analysis}|${p.validity}|${p.period_from}`;

export function Impacts({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [periods, setPeriods] = useState<IpcPeriod[]>([]);
  const [key, setKey] = useState("");
  const [rows, setRows] = useState<IpcRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<{ history: IpcRow[]; ipc_areas: { ipc_area: string; match: string }[] } | null>(null);
  const [asap, setAsap] = useState<AsapRow[]>([]);
  const [gdacs, setGdacs] = useState<any[]>([]);

  useEffect(() => {
    api.ipcPeriods().then((r) => {
      setPeriods(r.periods);
      const cur = r.periods.find((p) => p.validity === "current") ?? r.periods[0];
      if (cur) setKey(periodKey(cur));
    });
    api.asap().then((r) => setAsap(r.rows));
    api.gdacs().then((r) => setGdacs(r.rows));
  }, []);

  const period = periods.find((p) => periodKey(p) === key);
  useEffect(() => {
    if (period) api.ipc(period).then((r) => setRows(r.districts));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected) api.ipcDistrict(selected).then(setHistory);
    else setHistory(null);
  }, [selected]);

  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.district_id, r])), [rows]);
  const colorOf = useCallback((id: string) => (byId[id] ? colorFor(byId[id].pct_phase3plus, PCT) : "#52525b"), [byId]);
  const heightOf = useCallback((id: string) => (byId[id] ? Math.min(1, (byId[id].pct_phase3plus ?? 0) / 50) : 0.01), [byId]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) => {
      const r = byId[id];
      if (!r) return `<b>${name}</b> (${prov})<br/>Not analysed in this IPC round`;
      return `<b>${name}</b> (${prov})<br/>Phase 3+: <b>${fmt(r.pct_phase3plus, 0)}%</b> (${fmt(r.pop_phase3plus)} people)<br/>Phase 4: ${fmt(r.pop_phase4)} · analysed ${fmt(r.pop_analysed)}`;
    },
    [byId],
  );
  const sel = meta.districts.find((d) => d.district_id === selected);
  const total3 = rows.reduce((s, r) => s + (r.pop_phase3plus ?? 0), 0);

  return (
    <>
      <div className="split">
        <section className="panel map-panel">
          <div className="toolbar row">
            <span>IPC acute food insecurity</span>
            <select value={key} onChange={(e) => setKey(e.target.value)} className="grow">
              {periods.map((p) => <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>)}
            </select>
          </div>
          <div className="map-wrap">
            <MapView geo={geo} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf} selected={selected} onSelect={setSelected} version={`ipc-${key}-${rows.length}`}>
              <Legend title="% of people in IPC Phase 3+ (Crisis or worse)" items={[...legendStops(PCT, 6), { color: "#52525b", label: "not analysed" }]} />
            </MapView>
          </div>
          <p className="note">
            IPC analyses cover only the vulnerable districts assessed in each round. Newer districts are summed into their parent
            district (e.g. the six Karachi districts → Karachi). Source: IPC via HDX.
          </p>
        </section>

        <section className="panel side">
          <h2>{rows.length} districts analysed · {fmt(total3)} people in Phase 3+</h2>
          {sel && history && (
            <>
              <h3>{sel.district} – IPC history</h3>
              {history.history.length === 0 ? (
                <p className="muted">Not covered by any IPC analysis.</p>
              ) : (
                <div className="scroll short">
                  <table className="grid">
                    <thead><tr><th>Period</th><th>Type</th><th>Phase 3+</th><th>People</th></tr></thead>
                    <tbody>
                      {history.history.map((h, i) => (
                        <tr key={i}><td>{h.period_from} → {h.period_to}</td><td>{h.validity}</td><td>{fmt(h.pct_phase3plus, 0)}%</td><td>{fmt(h.pop_phase3plus)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {history.ipc_areas.length > 0 && (
                <p className="note">IPC areas: {history.ipc_areas.map((a) => `${a.ipc_area} (${a.match})`).join(", ")}</p>
              )}
            </>
          )}
          <h3>Districts by share in Phase 3+</h3>
          <div className="scroll">
            <table className="grid">
              <thead><tr><th>District</th><th>Phase 3+</th><th>People</th><th>Analysed</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.district_id} className={r.district_id === selected ? "sel" : ""} onClick={() => setSelected(r.district_id)}>
                    <td>{r.district}<div className="muted">{r.province}</div></td>
                    <td><span className="pill" style={{ background: colorFor(r.pct_phase3plus, PCT) }}>{fmt(r.pct_phase3plus, 0)}%</span></td>
                    <td>{fmt(r.pop_phase3plus)}</td>
                    <td>{fmt(r.pop_analysed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="split wide">
        <section className="panel">
          <h2>Agricultural production hotspots (JRC ASAP)</h2>
          <div className="scroll">
            {asap.map((a) => (
              <div key={a.date} className="feed-item">
                <div className="row">
                  <strong>{a.date}</strong>
                  <span className="pill" style={{ background: HOTSPOT_COLORS[a.hotspot_code] ?? "#94a3b8", color: a.hotspot_code === 2 ? "#fff" : undefined }}>{a.hotspot}</span>
                  <span className="muted">provinces with warnings: crop {a.n_provinces_crop_warning} · rangeland {a.n_provinces_rangeland_warning}</span>
                </div>
                {a.comment && <p className="note">{a.comment}</p>}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>GDACS drought alerts including Pakistan</h2>
          <table className="grid">
            <thead><tr><th>Event</th><th>From</th><th>To</th><th>Alert</th><th>Severity</th></tr></thead>
            <tbody>
              {gdacs.map((g) => (
                <tr key={`${g.event_id}-${g.episode_id}`}>
                  <td><a className="link" href={g.report_url} target="_blank" rel="noreferrer">{g.name}</a><div className="muted">{g.countries}</div></td>
                  <td>{g.from_date}</td>
                  <td>{g.to_date}</td>
                  <td><span className="pill" style={{ background: g.alert_level === "Red" ? "#b91c1c" : "#f59e0b", color: g.alert_level === "Red" ? "#fff" : undefined }}>{g.alert_level}</span></td>
                  <td className="muted">{g.severity_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">GDACS drought alerts start in 2018 and come from the Copernicus Global Drought Observatory.</p>
        </section>
      </div>
    </>
  );
}

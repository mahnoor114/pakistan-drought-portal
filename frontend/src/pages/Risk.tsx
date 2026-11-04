import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type RiskRow } from "../api";
import { fmt, RISK_COLORS } from "../colors";
import { Legend, MapView } from "../components/MapView";

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.round(v * 100)}%`, background: color }} />
    </div>
  );
}

export function Risk({ geo }: { geo: GeoJSON.FeatureCollection | null }) {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [method, setMethod] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.risk().then((r) => {
      setRows(r.districts);
      setMethod(r.method);
    });
  }, []);

  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.district_id, r])), [rows]);
  const colorOf = useCallback((id: string) => RISK_COLORS[byId[id]?.risk_class] ?? "#d4d4d8", [byId]);
  const heightOf = useCallback((id: string) => byId[id]?.risk_score ?? 0, [byId]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) => {
      const r = byId[id];
      if (!r) return name;
      return `<b>${name}</b> (${prov})<br/>Risk: <b>${r.risk_class}</b> (${fmt(r.risk_score)})<br/>Hazard ${fmt(r.hazard)} · Exposure ${fmt(r.exposure)} · Vulnerability ${fmt(r.vulnerability)}`;
    },
    [byId],
  );
  const sorted = [...rows].sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div className="split">
      <section className="panel map-panel">
        <div className="map-wrap">
          <MapView geo={geo} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf} selected={selected} onSelect={setSelected} version={`risk-${rows.length}`}>
            <Legend title="Drought risk" items={Object.entries(RISK_COLORS).map(([k, c]) => ({ color: c, label: k }))} />
          </MapView>
        </div>
        <p className="note">{method}</p>
      </section>
      <section className="panel side full">
        <h2>Districts ranked by drought risk <span className="muted">({sorted.length})</span></h2>
        <div className="scroll fill">
          <table className="grid">
            <thead>
              <tr><th>#</th><th>District</th><th>Risk</th><th>Hazard</th><th>Exposure</th><th>Vulner.</th><th>Drought freq.</th></tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.district_id} className={r.district_id === selected ? "sel" : ""} onClick={() => setSelected(r.district_id)}>
                  <td>{i + 1}</td>
                  <td>{r.district}<div className="muted">{r.province}</div></td>
                  <td><span className="pill" style={{ background: RISK_COLORS[r.risk_class], color: r.risk_class === "Very high" ? "#fff" : undefined }}>{r.risk_class}</span></td>
                  <td><Bar v={r.hazard} color="#c2410c" /></td>
                  <td><Bar v={r.exposure} color="#2563eb" /></td>
                  <td><Bar v={r.vulnerability} color="#7c3aed" /></td>
                  <td>{fmt(r.freq_spei3_drought * 100, 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

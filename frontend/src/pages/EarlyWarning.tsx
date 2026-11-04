import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ForecastRow, type Meta } from "../api";
import { colorFor, DROUGHT_CLASSES, fmt, heightFor } from "../colors";
import { Legend, MapView } from "../components/MapView";

const TARGETS: Record<string, string> = { spei_3: "SPEI-3 (meteorological)", vhi: "VHI (agricultural)" };

export function EarlyWarning({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [target, setTarget] = useState("spei_3");
  const [lead, setLead] = useState(1);
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [issued, setIssued] = useState("");
  const [skill, setSkill] = useState<any>(null);

  useEffect(() => {
    api.forecast(target).then((r) => {
      setRows(r.districts);
      setIssued(r.issued_from);
    });
  }, [target]);
  useEffect(() => {
    api.skill().then(setSkill);
  }, []);

  const ind = meta.indicators[target];
  const cur = useMemo(() => rows.filter((r) => r.lead === lead), [rows, lead]);
  const byId = useMemo(() => Object.fromEntries(cur.map((r) => [r.district_id, r])), [cur]);
  const colorOf = useCallback((id: string) => colorFor(byId[id]?.value, ind), [byId, ind]);
  const heightOf = useCallback((id: string) => heightFor(byId[id]?.value, ind), [byId, ind]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) => {
      const r = byId[id];
      return r
        ? `<b>${name}</b> (${prov})<br/>Forecast ${ind.label} for ${r.valid_date}: <b>${fmt(r.value)}</b><br/>${DROUGHT_CLASSES[r.class]?.label ?? ""} ${r.drought ? "– DROUGHT" : ""}`
        : name;
    },
    [byId, ind],
  );
  const dry = cur.filter((r) => r.drought).sort((a, b) => a.value - b.value);
  const validDate = cur[0]?.valid_date ?? "";
  const s = skill?.skill?.[`${target}_lead${lead}`];

  return (
    <div className="split">
      <section className="panel map-panel">
        <div className="toolbar row">
          <div className="tabs small">
            {Object.entries(TARGETS).map(([k, v]) => (
              <button key={k} className={k === target ? "active" : ""} onClick={() => setTarget(k)}>{v}</button>
            ))}
          </div>
          <div className="tabs small">
            {[1, 2, 3].map((l) => (
              <button key={l} className={l === lead ? "active" : ""} onClick={() => setLead(l)}>+{l} month</button>
            ))}
          </div>
        </div>
        <p className="muted">
          AI forecast issued from data up to <b>{issued}</b>, valid for <b>{validDate}</b>.
        </p>
        <div className="map-wrap">
          <MapView geo={geo} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf} version={`${target}-${lead}-${rows.length}`}>
          {ind && <Legend title={`Forecast ${ind.label}`} items={[
            { color: colorFor(target === "vhi" ? 0.05 : -2.2, ind), label: "extreme drought" },
            { color: colorFor(target === "vhi" ? 0.15 : -1.7, ind), label: "severe" },
            { color: colorFor(target === "vhi" ? 0.25 : -1.2, ind), label: "moderate" },
            { color: colorFor(target === "vhi" ? 0.35 : -0.7, ind), label: "mild" },
            { color: colorFor(target === "vhi" ? 0.45 : 0, ind), label: "normal" },
            { color: colorFor(target === "vhi" ? 0.7 : 1.5, ind), label: "wet / healthy" },
          ]} />}
            <div className="map-date">{validDate}</div>
          </MapView>
        </div>
      </section>
      <section className="panel side">
        <h2>Districts forecast in drought ({dry.length})</h2>
        <div className="scroll short">
          <table className="grid">
            <thead><tr><th>District</th><th>Province</th><th>Forecast</th><th>Class</th></tr></thead>
            <tbody>
              {dry.map((r) => (
                <tr key={r.district_id}>
                  <td>{r.district}</td><td>{r.province}</td><td>{fmt(r.value)}</td>
                  <td><span className="pill" style={{ background: DROUGHT_CLASSES[r.class]?.color }}>{DROUGHT_CLASSES[r.class]?.label}</span></td>
                </tr>
              ))}
              {dry.length === 0 && <tr><td colSpan={4} className="muted">No district forecast in drought.</td></tr>}
            </tbody>
          </table>
        </div>
        {s && (
          <>
            <h3>How reliable is this forecast? (tested on {s.test_years}, unseen by the model)</h3>
            <table className="grid">
              <thead><tr><th>Method</th><th>Correlation</th><th>RMSE</th><th>Droughts caught (POD)</th><th>False alarms (FAR)</th><th>F1</th></tr></thead>
              <tbody>
                {(["model", "persistence", "climatology"] as const).map((m) => (
                  <tr key={m} className={m === "model" ? "sel" : ""}>
                    <td>{m === "model" ? `AI model (${s.formulation})` : m === "persistence" ? "Persistence (no change)" : "Climatology (average)"}</td>
                    <td>{fmt(s[m].corr)}</td><td>{fmt(s[m].rmse)}</td><td>{fmt(s[m].pod * 100, 0)}%</td>
                    <td>{fmt(s[m].far * 100, 0)}%</td><td>{fmt(s[m].f1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">{skill.method}</p>
          </>
        )}
      </section>
    </div>
  );
}

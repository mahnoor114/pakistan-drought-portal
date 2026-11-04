import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Meta, type Series, type StatusRow } from "../api";
import { ALERT_COLORS, DROUGHT_CLASSES } from "../colors";
import { CountUp } from "../components/CountUp";
import { Legend, MapView } from "../components/MapView";
import { SeriesChart } from "../components/SeriesChart";

const CLASS = (c: number | null) => (c === null ? "no data" : DROUGHT_CLASSES[c]?.label ?? "–");

export function Overview({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [date, setDate] = useState(meta.latest_date);
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nat, setNat] = useState<Series | null>(null);

  useEffect(() => {
    api.status(date).then((r) => {
      setRows(r.districts);
      setCounts(r.counts);
    });
  }, [date]);
  useEffect(() => {
    api.region(["spei_3", "vhi", "gdo_grace_tws_anomaly"]).then(setNat);
  }, []);

  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.district_id, r])), [rows]);
  const colorOf = useCallback((id: string) => ALERT_COLORS[byId[id]?.alert ?? "Normal"], [byId]);
  const heightOf = useCallback(
    (id: string) => ({ Alert: 1, Warning: 0.6, Watch: 0.28, Normal: 0.03 } as Record<string, number>)[byId[id]?.alert ?? "Normal"],
    [byId],
  );
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) => {
      const r = byId[id];
      if (!r) return name;
      return `<b>${name}</b> (${prov})<br/>Status: <b>${r.alert}</b><br/>Meteorological: ${CLASS(r.met_class)}<br/>Agricultural: ${CLASS(r.agr_class)}<br/>Hydrological: ${CLASS(r.hyd_class)}`;
    },
    [byId],
  );

  const hot = rows.filter((r) => r.alert === "Alert" || r.alert === "Warning")
    .sort((a, b) => (b.drought_class ?? 0) - (a.drought_class ?? 0));
  const years = [...new Set(meta.dates.map((d) => d.slice(0, 4)))];

  return (
    <div className="split">
      <section className="panel map-panel">
        <div className="toolbar row">
          <span>Drought status for</span>
          <select value={date.slice(0, 4)} onChange={(e) => setDate(`${e.target.value}-${date.slice(5)}`)}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={date.slice(5)} onChange={(e) => setDate(`${date.slice(0, 4)}-${e.target.value}`)}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="cards">
          {["Alert", "Warning", "Watch", "Normal"].map((k) => (
            <div key={k} className="card" style={{ borderTopColor: ALERT_COLORS[k] }}>
              <div className="card-num"><CountUp value={counts[k] ?? 0} /></div>
              <div className="card-label">districts – {k}</div>
            </div>
          ))}
        </div>
        <div className="map-wrap">
          <MapView geo={geo} colorOf={colorOf} heightOf={heightOf} tooltipOf={tooltipOf} version={date + rows.length}>
          <Legend
            title="Combined drought status"
            items={[
              { color: ALERT_COLORS.Alert, label: "Alert – 2+ drought types" },
              { color: ALERT_COLORS.Warning, label: "Warning – 1 drought type" },
              { color: ALERT_COLORS.Watch, label: "Watch – mild dryness" },
              { color: ALERT_COLORS.Normal, label: "Normal" },
            ]}
          />
          <div className="map-date">{date}</div>
          </MapView>
        </div>
        <p className="note">
          Meteorological = SPEI-3; agricultural = VHI (fAPAR anomaly where MODIS is missing); hydrological = soil
          moisture anomaly (SPEI-12 before 2000). Moderate or worse (SPEI ≤ −1, VHI ≤ 0.3) counts as drought.
        </p>
      </section>
      <section className="panel side">
        <h2>Districts in Alert / Warning ({hot.length})</h2>
        <div className="scroll">
          <table className="grid">
            <thead>
              <tr><th>District</th><th>Province</th><th>Status</th><th>Met.</th><th>Agr.</th><th>Hyd.</th></tr>
            </thead>
            <tbody>
              {hot.map((r) => (
                <tr key={r.district_id}>
                  <td>{r.district}</td>
                  <td>{r.province}</td>
                  <td><span className="pill" style={{ background: ALERT_COLORS[r.alert] }}>{r.alert}</span></td>
                  <td>{CLASS(r.met_class)}</td>
                  <td>{CLASS(r.agr_class)}</td>
                  <td>{CLASS(r.hyd_class)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nat && (
          <>
            <h3>Pakistan – SPEI-3 (meteorological)</h3>
            <SeriesChart dates={nat.dates} series={{ spei_3: nat.series.spei_3 }} labels={{ spei_3: "SPEI-3" }} threshold={-1} height={160} />
            <h3>Pakistan – VHI (vegetation health)</h3>
            <SeriesChart dates={nat.dates} series={{ vhi: nat.series.vhi }} labels={{ vhi: "VHI" }} threshold={0.4} height={160} />
            <h3>Pakistan – groundwater / water storage (GRACE)</h3>
            <SeriesChart dates={nat.dates} series={{ g: nat.series.gdo_grace_tws_anomaly }} labels={{ g: "TWS anomaly" }} height={160} />
          </>
        )}
      </section>
    </div>
  );
}

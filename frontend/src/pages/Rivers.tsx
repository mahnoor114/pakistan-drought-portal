import { useEffect, useMemo, useState } from "react";
import { api, type Meta, type Station } from "../api";
import { colorFor, fmt } from "../colors";
import { Legend, MapView, type MapPoint } from "../components/MapView";
import { SeriesChart } from "../components/SeriesChart";

const SRI = { label: "SRI-3", scale: "drought" as const, mid: 0, min: -2.5, max: 2.5, unit: "index", source: "GloFAS", category: "" };

export function Rivers({ meta, geo }: { meta: Meta; geo: GeoJSON.FeatureCollection | null }) {
  const [date, setDate] = useState(meta.latest_date);
  const [stations, setStations] = useState<Station[]>([]);
  const [station, setStation] = useState("Tarbela");
  const [ts, setTs] = useState<any>(null);

  useEffect(() => {
    api.rivers(date).then((r) => setStations(r.stations));
  }, [date]);
  useEffect(() => {
    api.river(station).then(setTs);
  }, [station]);

  const years = [...new Set(meta.dates.map((d) => d.slice(0, 4)))];
  const points: MapPoint[] = useMemo(
    () =>
      stations.map((s) => ({
        id: s.station,
        lon: s.lon,
        lat: s.lat,
        color: colorFor(s.sri_3, SRI),
        radius: 6 + Math.sqrt(s.mean_discharge_m3s) / 6,
        pulse: s.sri_3 !== null && s.sri_3 <= -1,
        html: `<b>${s.station}</b> (${s.river})<br/>Flow: ${fmt(s.discharge_mean_m3s, 0)} m³/s (${fmt(s.discharge_pct_of_normal, 0)}% of normal)<br/>SRI-3: ${fmt(s.sri_3)} · SRI-6: ${fmt(s.sri_6)}`,
      })),
    [stations],
  );

  return (
    <div className="split">
      <section className="panel map-panel">
        <div className="toolbar row">
          <span>River flow drought (SRI-3) for</span>
          <select value={date.slice(0, 4)} onChange={(e) => setDate(`${e.target.value}-${date.slice(5)}`)}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={date.slice(5)} onChange={(e) => setDate(`${date.slice(0, 4)}-${e.target.value}`)}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="map-wrap">
          <MapView
            geo={geo}
            colorOf={() => "#64748b"}
            heightOf={() => 0.01}
            tooltipOf={(_, n, p) => `${n} (${p})`}
            version="rivers"
            points={points}
            selectedPoint={station}
            onPointClick={setStation}
          >
          <Legend
            title="SRI-3 (river flow drought)"
            items={[
              { color: colorFor(-2.2, SRI), label: "≤ −2 extreme" },
              { color: colorFor(-1.6, SRI), label: "−2 … −1.5 severe" },
              { color: colorFor(-1.1, SRI), label: "−1.5 … −1 moderate" },
              { color: colorFor(0, SRI), label: "near normal" },
              { color: colorFor(1.5, SRI), label: "wet" },
            ]}
          />
          <div className="map-date">{date}</div>
          </MapView>
        </div>
        <p className="note">
          Discharge from GloFAS (Open-Meteo Flood API). SRI = standardized runoff index, GEV fit per calendar month
          (as in Rahman et al., 2023). GloFAS does not fully subtract canal withdrawals, so flows below barrages are
          higher than gauged values. Circle size ∝ mean flow; pulsing = river drought (SRI-3 ≤ −1).
        </p>
      </section>
      <section className="panel side">
        <h2>{station}{ts ? ` – ${ts.river}` : ""}</h2>
        <select value={station} onChange={(e) => setStation(e.target.value)}>
          {stations.map((s) => <option key={s.station}>{s.station}</option>)}
        </select>
        {ts && (
          <>
            <h3>Monthly discharge (m³/s)</h3>
            <SeriesChart dates={ts.dates} series={{ q: ts.discharge_mean_m3s }} labels={{ q: "mean discharge" }} />
            <h3>River-flow drought index</h3>
            <SeriesChart dates={ts.dates} series={{ sri_3: ts.sri_3, sri_6: ts.sri_6 }} labels={{ sri_3: "SRI-3", sri_6: "SRI-6" }} threshold={-1} />
            <h3>Flow as % of normal for the month</h3>
            <SeriesChart dates={ts.dates} series={{ p: ts.discharge_pct_of_normal }} labels={{ p: "% of normal" }} threshold={70} />
          </>
        )}
      </section>
    </div>
  );
}

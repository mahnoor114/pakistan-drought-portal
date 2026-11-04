import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Meta, type Series } from "../api";
import { colorFor, fmt, heightFor, legendStops } from "../colors";
import { Legend, MapView } from "../components/MapView";
import { SeriesChart } from "../components/SeriesChart";

interface Props {
  meta: Meta;
  geo: GeoJSON.FeatureCollection | null;
  initialCategory?: string;
}

const KEY_INDICATORS = ["spei_3", "spi_3", "vhi", "gdo_soil_moisture_anomaly", "gdo_grace_tws_anomaly", "rain_mm"];

export function Monitor({ meta, geo, initialCategory = "meteorological" }: Props) {
  const [category, setCategory] = useState(initialCategory);
  const inCat = useMemo(
    () => Object.entries(meta.indicators).filter(([, v]) => v.category === category),
    [meta, category],
  );
  const [indicator, setIndicator] = useState(inCat[0]?.[0] ?? "spei_3");
  const [dateIdx, setDateIdx] = useState(meta.dates.length - 1);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [keySeries, setKeySeries] = useState<Series | null>(null);
  const [playing, setPlaying] = useState(false);

  const date = meta.dates[dateIdx];
  const ind = meta.indicators[indicator];

  useEffect(() => {
    if (!inCat.find(([k]) => k === indicator)) setIndicator(inCat[0]?.[0]);
  }, [inCat, indicator]);

  useEffect(() => {
    if (!indicator) return;
    api.map(indicator, date).then((r) => setValues(r.values)).catch(() => setValues({}));
  }, [indicator, date]);

  useEffect(() => {
    if (!indicator) return;
    const p = selected ? api.district(selected, [indicator]) : api.region([indicator]);
    p.then(setSeries).catch(() => setSeries(null));
  }, [selected, indicator]);

  useEffect(() => {
    if (!selected) return setKeySeries(null);
    api.district(selected, KEY_INDICATORS).then(setKeySeries).catch(() => setKeySeries(null));
  }, [selected]);

  // time-lapse: step through the months
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setDateIdx((i) => {
        if (i >= meta.dates.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 900);
    return () => clearInterval(t);
  }, [playing, meta.dates.length]);

  const heightOf = useCallback((id: string) => heightFor(values[id], ind), [values, ind]);
  const colorOf = useCallback((id: string) => colorFor(values[id], ind), [values, ind]);
  const tooltipOf = useCallback(
    (id: string, name: string, prov: string) =>
      `<b>${name}</b> (${prov})<br/>${ind?.label}: ${fmt(values[id])} ${ind?.unit ?? ""}`,
    [values, ind],
  );

  const idxInSeries = keySeries ? keySeries.dates.indexOf(date) : -1;
  const sel = meta.districts.find((d) => d.district_id === selected);

  return (
    <div className="split">
      <section className="panel map-panel">
        <div className="toolbar">
          <div className="tabs small">
            {Object.entries(meta.categories).map(([k, v]) => (
              <button key={k} className={k === category ? "active" : ""} onClick={() => setCategory(k)}>
                {v}
              </button>
            ))}
          </div>
          <div className="row">
            <select value={indicator} onChange={(e) => setIndicator(e.target.value)}>
              {inCat.map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <button
              className="play"
              onClick={() => {
                if (!playing && dateIdx >= meta.dates.length - 1) setDateIdx(0);
                setPlaying((p) => !p);
              }}
              title="Animate through time"
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <input
              type="range"
              min={0}
              max={meta.dates.length - 1}
              value={dateIdx}
              onChange={(e) => setDateIdx(+e.target.value)}
              className="grow"
            />
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
            version={`${indicator}-${date}-${Object.keys(values).length}`}
          >
            {ind && <Legend title={`${ind.label} (${ind.unit})`} items={legendStops(ind)} />}
            <div className="map-date">{date}</div>
          </MapView>
        </div>
        {ind && <p className="note">Source: {ind.source}. Click a district for its history.</p>}
      </section>

      <section className="panel side">
        <h2>{sel ? `${sel.district}, ${sel.province}` : "Pakistan (area-weighted)"}</h2>
        {sel && (
          <button className="link" onClick={() => setSelected(null)}>
            ← back to national view
          </button>
        )}
        {series && ind && (
          <>
            <h3>{ind.label} – monthly</h3>
            <SeriesChart
              dates={series.dates}
              series={{ [indicator]: series.series[indicator] }}
              labels={{ [indicator]: ind.label }}
              threshold={ind.drought_threshold}
            />
          </>
        )}
        {keySeries && (
          <>
            <h3>Key indicators in {date}</h3>
            <table className="kv">
              <tbody>
                {KEY_INDICATORS.map((k) => (
                  <tr key={k}>
                    <td>{meta.indicators[k]?.label ?? k}</td>
                    <td>{idxInSeries >= 0 ? fmt(keySeries.series[k][idxInSeries]) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Meteorological vs agricultural drought</h3>
            <SeriesChart
              dates={keySeries.dates}
              series={{ spei_3: keySeries.series.spei_3, vhi: keySeries.series.vhi.map((v) => (v === null ? null : (v - 0.4) * 5)) }}
              labels={{ spei_3: "SPEI-3", vhi: "VHI (rescaled: 0 = 0.4 threshold)" }}
              threshold={-1}
            />
          </>
        )}
      </section>
    </div>
  );
}

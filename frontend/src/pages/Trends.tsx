import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Meta } from "../api";
import { SeriesChart } from "../components/SeriesChart";

export function Trends({ meta }: { meta: Meta }) {
  const options = useMemo(
    () => Object.entries(meta.indicators).filter(([, v]) => v.drought_threshold !== undefined),
    [meta],
  );
  const [indicator, setIndicator] = useState("spei_3");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.trends>> | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    api.trends(indicator).then(setData);
  }, [indicator]);
  useEffect(() => {
    api.events().then((r) => setEvents(r.events));
  }, []);

  const ind = meta.indicators[indicator];
  const bars = data ? data.years.map((y, i) => ({ year: y, pct: data.national_pct_in_drought[i] })) : [];
  const provDates = data ? data.years.map(String) : [];

  return (
    <div className="split">
      <section className="panel">
        <div className="toolbar row">
          <span>Drought trend by</span>
          <select value={indicator} onChange={(e) => setIndicator(e.target.value)}>
            {options.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="muted">
            drought = {ind?.label} {ind?.drought_below === false ? "≥" : "≤"} {ind?.drought_threshold}
          </span>
        </div>
        <h3>Share of district-months in drought, Pakistan (%)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={bars}>
            <CartesianGrid stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis unit="%" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} cursor={{ fill: "#94a3b822" }} />
            <Bar dataKey="pct" name="% in drought" fill="#c2410c" />
          </BarChart>
        </ResponsiveContainer>
        {data && (
          <>
            <h3>By province (%)</h3>
            <SeriesChart dates={provDates} series={data.provinces} height={300} />
            <h3>National mean {ind?.label}</h3>
            <SeriesChart dates={provDates} series={{ m: data.national_mean }} labels={{ m: ind?.label ?? "" }} threshold={ind?.drought_threshold} />
          </>
        )}
      </section>
      <section className="panel side">
        <h2>Historical drought events (JRC, 1951–2016)</h2>
        <p className="note">Country-level events detected with SPI/SPEI. Severity = accumulated deficit; area = widest extent.</p>
        <div className="scroll">
          <table className="grid">
            <thead>
              <tr><th>Index</th><th>Start</th><th>End</th><th>Months</th><th>Severity</th><th>Area %</th></tr>
            </thead>
            <tbody>
              {events
                .filter((e) => e.index === "SPEI03" || e.index === "SPI03")
                .sort((a, b) => b.severity - a.severity)
                .map((e, i) => (
                  <tr key={i}>
                    <td>{e.index}</td>
                    <td>{e.start_date}</td>
                    <td>{e.end_date}</td>
                    <td>{e.duration}</td>
                    <td>{e.severity?.toFixed(1)}</td>
                    <td>{e.widest_area_perc?.toFixed(0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

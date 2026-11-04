import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

interface Props {
  dates: string[];
  series: Record<string, (number | null)[]>;
  labels?: Record<string, string>;
  threshold?: number;
  height?: number;
  unit?: string;
}

export function SeriesChart({ dates, series, labels, threshold, height = 220, unit }: Props) {
  const keys = Object.keys(series);
  const rows = dates.map((d, i) => {
    const r: Record<string, string | number | null> = { date: d };
    keys.forEach((k) => (r[k] = series[k][i]));
    return r;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#94a3b833" vertical={false} />
        <XAxis dataKey="date" minTickGap={40} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} unit={unit} />
        <Tooltip formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)} contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {threshold !== undefined && (
          <ReferenceLine y={threshold} stroke="#b91c1c" strokeDasharray="4 3" label={{ value: "drought", fontSize: 10, fill: "#b91c1c", position: "insideBottomLeft" }} />
        )}
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            name={labels?.[k] ?? k}
            stroke={PALETTE[i % PALETTE.length]}
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
            isAnimationActive
            animationDuration={900}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

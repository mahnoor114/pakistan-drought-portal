import type { Indicator } from "./api";

// Drought-to-wet diverging palette (dark red = extreme drought ... dark blue = very wet)
const DIVERGING = ["#7f2704", "#c2410c", "#f59e0b", "#fde68a", "#f5f5f4", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];
const SEQ = ["#f7fcf5", "#d9f0d3", "#a6dba0", "#5aae61", "#1b7837", "#00441b"];
const SEQ_R = ["#fff7ec", "#fdd49e", "#fc8d59", "#e34a33", "#b30000", "#7f0000"];

function pick(palette: string[], t: number) {
  const i = Math.max(0, Math.min(palette.length - 1, Math.round(t * (palette.length - 1))));
  return palette[i];
}

export function colorFor(v: number | null | undefined, ind: Indicator): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "#d4d4d8";
  if (ind.scale === "drought") {
    const mid = ind.mid ?? 0;
    // map [min, mid] -> [0, .5] and [mid, max] -> [.5, 1]
    const t = v <= mid ? 0.5 * (v - ind.min) / (mid - ind.min) : 0.5 + 0.5 * (v - mid) / (ind.max - mid);
    return pick(DIVERGING, Math.max(0, Math.min(1, t)));
  }
  const t = (v - ind.min) / (ind.max - ind.min);
  return pick(ind.scale === "seq" ? SEQ : SEQ_R, Math.max(0, Math.min(1, t)));
}

export function legendStops(ind: Indicator, n = 7): { color: string; label: string }[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = ind.min + ((ind.max - ind.min) * i) / (n - 1);
    out.push({ color: colorFor(v, ind), label: fmt(v) });
  }
  return out;
}

export function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(digits);
}

export const DROUGHT_CLASSES = [
  { label: "None", color: "#f5f5f4" },
  { label: "Mild", color: "#fde68a" },
  { label: "Moderate", color: "#f59e0b" },
  { label: "Severe", color: "#c2410c" },
  { label: "Extreme", color: "#7f2704" },
];

export const ALERT_COLORS: Record<string, string> = {
  Normal: "#e7e5e4",
  Watch: "#fde68a",
  Warning: "#f59e0b",
  Alert: "#b91c1c",
};

export const RISK_COLORS: Record<string, string> = {
  Low: "#fef3c7",
  Moderate: "#fbbf24",
  High: "#ea580c",
  "Very high": "#991b1b",
};

/** 0..1 extrusion height: drier / more stressed / higher-risk = taller. */
export function heightFor(v: number | null | undefined, ind: Indicator): number {
  if (v === null || v === undefined || Number.isNaN(v)) return 0.01;
  if (ind.scale === "drought") {
    const mid = ind.mid ?? 0;
    // only the dry side rises; wet values stay flat
    return v >= mid ? 0.03 : 0.03 + 0.97 * Math.min(1, (mid - v) / (mid - ind.min));
  }
  const t = Math.max(0, Math.min(1, (v - ind.min) / (ind.max - ind.min)));
  return 0.03 + 0.97 * t;
}

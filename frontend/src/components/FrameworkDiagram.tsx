/**
 * System framework of the portal: data sources -> processing -> PostgreSQL -> FastAPI -> React -> users.
 * Colours come from a palette so the same drawing follows the portal theme (CSS variables) and can be
 * rendered with fixed colours for reports (scripts/render-framework.mjs writes docs/portal_framework.svg).
 */
import type { ReactNode } from "react";

export interface Palette {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  line: string;
  src: string;
  proc: string;
  db: string;
  api: string;
  web: string;
  out: string;
}

export const THEME_PALETTE: Palette = {
  bg: "var(--bg)", panel: "var(--panel)", ink: "var(--ink)", muted: "var(--muted)", line: "var(--muted)",
  src: "#3b82f6", proc: "#8b5cf6", db: "#14b8a6", api: "#f59e0b", web: "#f43f5e", out: "#22c55e",
};

export const PRINT_PALETTE: Palette = {
  bg: "#ffffff", panel: "#ffffff", ink: "#111827", muted: "#4b5563", line: "#6b7280",
  src: "#2563eb", proc: "#7c3aed", db: "#0d9488", api: "#d97706", web: "#e11d48", out: "#16a34a",
};

const W = 1200, H = 720;
const COL = {
  src: { x: 20, w: 240 }, proc: { x: 300, w: 220 }, db: { x: 560, w: 180 }, api: { x: 780, w: 180 }, web: { x: 1000, w: 180 },
};
const TOP = 104, BOTTOM = 566;

export function FrameworkDiagram({ palette = THEME_PALETTE, title = true }: { palette?: Palette; title?: boolean }) {
  const p = palette;

  const box = (x: number, y: number, w: number, h: number, color: string, strong = false) => (
    <rect x={x} y={y} width={w} height={h} rx={10} fill={color} fillOpacity={strong ? 0.16 : 0.09}
      stroke={color} strokeWidth={strong ? 1.8 : 1.2} />
  );
  const card = (x: number, y: number, w: number, h: number, color: string, head: string, lines: string[], size = 11.5) => (
    <g>
      {box(x, y, w, h, color)}
      <text x={x + 12} y={y + 22} fontSize={13} fontWeight={700} fill={p.ink}>{head}</text>
      {lines.map((l, i) => (
        <text key={i} x={x + 12} y={y + 42 + i * 16} fontSize={size} fill={p.muted}>{l}</text>
      ))}
    </g>
  );
  const header = (c: { x: number; w: number }, n: number, label: string, color: string) => (
    <g>
      <circle cx={c.x + 11} cy={84} r={10} fill={color} />
      <text x={c.x + 11} y={88} fontSize={11.5} fontWeight={700} fill="#ffffff" textAnchor="middle">{n}</text>
      <text x={c.x + 28} y={88} fontSize={11.5} fontWeight={700} letterSpacing={1.2} fill={color}>{label}</text>
    </g>
  );
  const arrow = (d: string, both = false) => (
    <path d={d} fill="none" stroke={p.line} strokeWidth={1.4} markerEnd="url(#fw-arrow)"
      markerStart={both ? "url(#fw-arrow)" : undefined} />
  );
  const label = (x: number, y: number, t: string, anchor: "start" | "middle" | "end" = "middle") => (
    <text x={x} y={y} fontSize={10.5} fill={p.muted} textAnchor={anchor}>{t}</text>
  );
  const chip = (x: number, y: number, t: string, color: string): [ReactNode, number] => {
    const w = Math.round(t.length * 6.4 + 22);
    return [
      <g key={t}>
        <rect x={x} y={y} width={w} height={26} rx={13} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1} />
        <text x={x + w / 2} y={y + 17} fontSize={11.5} fill={p.ink} textAnchor="middle">{t}</text>
      </g>,
      w,
    ];
  };
  const chips = (x: number, y: number, items: string[], color: string) => {
    const out: ReactNode[] = [];
    let cx = x;
    for (const t of items) {
      const [node, w] = chip(cx, y, t, color);
      out.push(node);
      cx += w + 8;
    }
    return out;
  };

  // processing steps
  const steps: [string, string[]][] = [
    ["Download & clip", ["15 Python scripts, open APIs", "Pakistan box 60–78°E, 23–38°N", "skip, resume, manifest"]],
    ["District aggregation", ["126 districts, monthly", "area-weighted zonal means", "rasters → pixel tables"]],
    ["Drought indices", ["SPI · SPEI, 1–12 months", "VHI · VCI · TCI · SRI", "groundwater anomaly · GGDI"]],
    ["Models & analytics", ["Gradient boosting, 1–3 mo", "hazard–exposure risk index", "CMIP6 projections to 2050"]],
  ];
  const stepY = (i: number) => TOP + i * 122;
  const pcx = COL.proc.x + COL.proc.w / 2;

  // sources
  const sources: [string, string[]][] = [
    ["Climate & weather", ["CHIRPS · GPCC · CRU TS", "TerraClimate · NASA POWER", "ERA5-Land · NCEP/NCAR R1", "NOAA climate indices (ENSO, IOD)"]],
    ["Satellite land & water", ["MODIS NDVI · LST · ET", "GRACE/GRACE-FO water storage", "Landsat reservoirs · WorldCover", "GloFAS river discharge"]],
    ["Climate projections", ["CMIP6 · ISIMIP3b (5 GCMs)", "Bias-corrected South Asia (13)", "World Bank CCKP", "SSP1-2.6 · 2-4.5 · 3-7.0 · 5-8.5"]],
    ["Impacts & society", ["IPC food insecurity · GDACS", "JRC ASAP crop hotspots", "FAOSTAT · GDHY · Punjab stats", "WorldPop · census · SSP pop."]],
  ];
  const srcY = (i: number) => TOP + i * 118;

  const db = COL.db, dcx = db.x + db.w / 2;
  const api = COL.api, web = COL.web;
  const mid = 335;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pakistan Drought Monitoring Portal system framework"
      style={{ width: "100%", height: "auto", display: "block", background: p.bg, fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <defs>
        <marker id="fw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={p.line} />
        </marker>
      </defs>

      {title && (
        <g>
          <text x={20} y={34} fontSize={20} fontWeight={700} fill={p.ink}>Pakistan Drought Monitoring Portal — system framework</text>
          <text x={20} y={56} fontSize={12.5} fill={p.muted}>
            Open data → Python processing → PostgreSQL → FastAPI → React portal · 126 districts · observations 1981–2025, projections to 2050
          </text>
        </g>
      )}

      {header(COL.src, 1, "DATA SOURCES", p.src)}
      {header(COL.proc, 2, "PROCESSING (PYTHON)", p.proc)}
      {header(COL.db, 3, "DATABASE", p.db)}
      {header(COL.api, 4, "API", p.api)}
      {header(COL.web, 5, "WEB PORTAL", p.web)}

      {/* 1. sources + bus into processing */}
      {sources.map(([h, l], i) => <g key={h}>{card(COL.src.x, srcY(i), COL.src.w, 104, p.src, h, l)}</g>)}
      <g fill="none" stroke={p.line} strokeWidth={1.4}>
        {sources.map((_, i) => <path key={i} d={`M${COL.src.x + COL.src.w} ${srcY(i) + 52}H280`} />)}
        <path d={`M280 ${srcY(0) + 52}V${srcY(3) + 52}`} />
      </g>
      {arrow(`M280 ${stepY(0) + 48}H${COL.proc.x}`)}
      <text transform={`translate(275 ${(srcY(1) + srcY(2)) / 2 + 52}) rotate(-90)`} fontSize={10.5} fill={p.muted} textAnchor="middle">
        open APIs
      </text>

      {/* 2. processing chain */}
      {steps.map(([h, l], i) => <g key={h}>{card(COL.proc.x, stepY(i), COL.proc.w, 96, p.proc, `${i + 1}. ${h}`, l)}</g>)}
      {steps.slice(1).map((_, i) => <g key={i}>{arrow(`M${pcx} ${stepY(i) + 96}V${stepY(i + 1)}`)}</g>)}

      {/* processing -> database */}
      {[1, 2, 3].map((i) => <g key={i}>{arrow(`M${COL.proc.x + COL.proc.w} ${stepY(i) + 48}H${db.x}`)}</g>)}
      {label(540, stepY(1) + 40, "COPY")}

      {/* 3. database cylinder */}
      <g>
        <path d={`M${db.x} ${TOP + 16}V${BOTTOM - 16}A${db.w / 2} 16 0 0 0 ${db.x + db.w} ${BOTTOM - 16}V${TOP + 16}`}
          fill={p.db} fillOpacity={0.1} stroke={p.db} strokeWidth={1.4} />
        <ellipse cx={dcx} cy={TOP + 16} rx={db.w / 2} ry={16} fill={p.db} fillOpacity={0.22} stroke={p.db} strokeWidth={1.4} />
        <text x={dcx} y={TOP + 62} fontSize={15} fontWeight={700} fill={p.ink} textAnchor="middle">PostgreSQL 17</text>
        <text x={dcx} y={TOP + 80} fontSize={11.5} fill={p.muted} textAnchor="middle">“landslide portal 2”</text>
        <text x={dcx} y={TOP + 96} fontSize={11.5} fill={p.muted} textAnchor="middle">schema drought</text>
        <text x={dcx} y={TOP + 142} fontSize={30} fontWeight={800} fill={p.db} textAnchor="middle">81</text>
        <text x={dcx} y={TOP + 160} fontSize={11.5} fill={p.muted} textAnchor="middle">tables</text>
        <text x={dcx} y={TOP + 204} fontSize={30} fontWeight={800} fill={p.db} textAnchor="middle">16.4 M</text>
        <text x={dcx} y={TOP + 222} fontSize={11.5} fill={p.muted} textAnchor="middle">rows</text>
        {["master monthly tables", "drought indices", "grid_* raster pixels", "portal_* outputs", "impacts · crops · water", "table & file catalogues"].map((t, i) => (
          <text key={t} x={db.x + 16} y={TOP + 262 + i * 22} fontSize={11.5} fill={p.ink}>• {t}</text>
        ))}
        <text x={dcx} y={BOTTOM - 30} fontSize={10.5} fill={p.muted} textAnchor="middle">tablespace on D:</text>
      </g>

      {/* database <-> API */}
      {arrow(`M${db.x + db.w} ${mid}H${api.x}`, true)}
      {label((db.x + db.w + api.x) / 2, mid - 8, "SQL")}

      {/* 4. API */}
      {box(api.x, TOP, api.w, BOTTOM - TOP, p.api, true)}
      <text x={api.x + 12} y={TOP + 24} fontSize={14} fontWeight={700} fill={p.ink}>FastAPI</text>
      <text x={api.x + 12} y={TOP + 42} fontSize={11.5} fill={p.muted}>43 endpoints · /docs</text>
      {card(api.x + 10, 164, 160, 118, p.api, "main.py", ["status · maps", "trends · risk", "forecasts · rivers"], 11)}
      {card(api.x + 10, 296, 160, 118, p.api, "themes.py", ["groundwater", "reservoirs · impacts", "crops · projections"], 11)}
      {card(api.x + 10, 428, 160, 118, p.api, "explorer + layers", ["any table in the DB", "map layers · filters", "CSV download"], 11)}

      {/* API -> web */}
      {arrow(`M${api.x + api.w} ${mid}H${web.x}`)}
      {label((api.x + api.w + web.x) / 2, mid - 8, "JSON")}

      {/* 5. web portal */}
      {box(web.x, TOP, web.w, BOTTOM - TOP, p.web, true)}
      <text x={web.x + 12} y={TOP + 24} fontSize={14} fontWeight={700} fill={p.ink}>React web portal</text>
      <text x={web.x + 12} y={TOP + 42} fontSize={11.5} fill={p.muted}>Vite · TypeScript · Mapbox</text>
      {card(web.x + 10, 164, 160, 96, p.web, "Monitor", ["Pakistan map · Status", "Monitor · Agricultural", "Rivers · Water storage"], 11)}
      {card(web.x + 10, 270, 160, 80, p.web, "Impacts & risk", ["Impacts · Crops", "Risk zones · Trends"], 11)}
      {card(web.x + 10, 360, 160, 80, p.web, "Outlook", ["Early warning", "Projections to 2050"], 11)}
      {card(web.x + 10, 450, 160, 96, p.web, "Data", ["Data explorer", "Architecture", "Data & methods"], 11)}

      {/* outputs and users */}
      {arrow(`M${web.x + web.w / 2} ${BOTTOM}V598`)}
      {box(20, 598, W - 40, 106, p.out)}
      <text x={36} y={624} fontSize={13} fontWeight={700} fill={p.ink}>Outputs</text>
      {chips(36, 636, ["Drought status & alerts", "1–3 month forecasts", "Risk zones", "Projections 2015–2050", "Maps & charts", "CSV & API downloads"], p.out)}
      <text x={36} y={690} fontSize={13} fontWeight={700} fill={p.ink}>Users</text>
      {chips(90, 672, ["Researchers & students", "NDMA · PDMA · PMD", "Agriculture & water managers", "NGOs & food-security analysts"], p.out)}
    </svg>
  );
}

/** Serialise an on-page diagram with CSS variables resolved, so the file looks the same outside the portal. */
export function exportSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const css = getComputedStyle(document.documentElement);
  const resolve = (s: string) => s.replace(/var\((--[\w-]+)\)/g, (_, v) => css.getPropertyValue(v).trim() || "#000");
  clone.querySelectorAll("*").forEach((el) => {
    for (const a of ["fill", "stroke"]) {
      const v = el.getAttribute(a);
      if (v?.includes("var(")) el.setAttribute(a, resolve(v));
    }
  });
  const st = clone.getAttribute("style");
  if (st) clone.setAttribute("style", resolve(st));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(W));
  clone.setAttribute("height", String(H));
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGSVGElement, name = "portal_framework.svg") {
  const blob = new Blob([exportSvg(svg)], { type: "image/svg+xml" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadPng(svg: SVGSVGElement, name = "portal_framework.png", scale = 2) {
  const img = new Image();
  img.onload = () => {
    const c = Object.assign(document.createElement("canvas"), { width: W * scale, height: H * scale });
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, W * scale, H * scale);
    c.toBlob((b) => {
      if (!b) return;
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: name });
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(exportSvg(svg));
}

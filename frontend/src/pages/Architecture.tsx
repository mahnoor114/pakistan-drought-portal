import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { fmt } from "../colors";
import { downloadPng, downloadSvg, FrameworkDiagram } from "../components/FrameworkDiagram";

const LAYERS: [string, string, string, string][] = [
  ["1. Data sources", "Open datasets: CHIRPS, TerraClimate, CRU, GPCC, NASA POWER, ERA5-Land, MODIS, GRACE, Landsat, GloFAS, CMIP6 (ISIMIP3b, CCKP, Mishra 2020), IPC, FAOSTAT, WorldPop",
    "HTTPS, THREDDS subsetting, Zenodo, ISIMIP, Planetary Computer", "Drought_Data/ (raw rasters, NetCDF)"],
  ["2. Processing", "Download and clip to Pakistan, area-weighted district means, SPI/SPEI, VHI, groundwater anomaly, river SRI, risk index, gradient-boosting forecasts, CMIP6 summaries",
    "Python: pandas, numpy, rasterio, netCDF4, xarray, scikit-learn", "download_*.py, open_*.py, missing_alternatives.py, download_paper_datasets.py, build_master.py, portal/backend/prepare.py"],
  ["3. Database", "All tables in one schema; pixel tables for rasters; catalogues of tables and files",
    "PostgreSQL 17, COPY bulk load, tablespace on D:", "load_to_postgres.py → \"landslide portal 2\".drought"],
  ["4. API", "Read-only JSON API over the database: core drought endpoints, thematic endpoints, generic table explorer with CSV export",
    "FastAPI, SQLAlchemy, psycopg2; OpenAPI docs at /docs", "portal/backend/app/{main,themes,explorer,db}.py"],
  ["5. Web portal", "Interactive maps (3D districts), charts and tables in 13 pages grouped as Monitor, Impacts & risk, Outlook and Data",
    "React 19, TypeScript, Vite, Mapbox GL, Recharts", "portal/frontend/src/"],
];

export function Architecture() {
  const box = useRef<HTMLDivElement>(null);
  const [cat, setCat] = useState<{ tables: number; rows: number } | null>(null);
  useEffect(() => {
    api.catalog().then((c) => setCat({ tables: c.tables.length, rows: c.tables.reduce((s, t) => s + (t.rows ?? 0), 0) })).catch(() => {});
  }, []);
  const svg = () => box.current?.querySelector("svg") as SVGSVGElement | null;

  return (
    <div className="architecture">
      <section className="panel">
        <div className="row">
          <h2 className="grow">System framework</h2>
          <button className="btn" onClick={() => svg() && downloadSvg(svg()!)}>⬇ SVG</button>
          <button className="btn" onClick={() => svg() && downloadPng(svg()!)}>⬇ PNG</button>
        </div>
        <p className="muted">
          Data flows left to right: open sources are downloaded and processed in Python, loaded into PostgreSQL
          ({cat ? `${cat.tables} tables, ${fmt(cat.rows / 1e6, 1)} million rows` : "loading…"}), served by FastAPI and shown in the React portal.
          The downloads follow the current theme; a print version is in <code>docs/portal_framework.svg</code>.
        </p>
        <div ref={box} className="framework-box">
          <FrameworkDiagram />
        </div>
      </section>

      <section className="panel">
        <h2>Layers</h2>
        <table className="grid">
          <thead><tr><th>Layer</th><th>What it does</th><th>Technology</th><th>Where</th></tr></thead>
          <tbody>
            {LAYERS.map(([a, b, c, d]) => (
              <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td><code>{d}</code></td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="split wide">
        <section className="panel">
          <h2>Update the data</h2>
          <ol className="steps">
            <li>Download or refresh sources: <code>python download_paper_datasets.py</code>, <code>python missing_alternatives.py</code> and the other download scripts (all skip existing files).</li>
            <li>Rebuild the district tables: <code>python build_master.py</code>.</li>
            <li>Rebuild drought status, risk and forecasts: <code>cd portal/backend &amp;&amp; python prepare.py</code>.</li>
            <li>Load everything into PostgreSQL: <code>python load_to_postgres.py</code>.</li>
            <li>Restart the API so cached summaries refresh.</li>
          </ol>
        </section>
        <section className="panel">
          <h2>Run the portal</h2>
          <ol className="steps">
            <li>Start PostgreSQL (service <code>postgresql-x64-17</code>).</li>
            <li>API + web app: <code>portal\start_portal.bat</code>, then open <code>http://localhost:8050</code>.</li>
            <li>API documentation: <a className="link" href="/docs" target="_blank" rel="noreferrer">/docs</a>; every table: <code>/api/data/&lt;table&gt;</code>.</li>
            <li>Frontend development: <code>cd portal/frontend &amp;&amp; npm run dev</code> (port 5173).</li>
            <li>Connection settings: <code>portal/backend/.env</code>.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

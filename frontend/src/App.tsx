import { useEffect, useRef, useState } from "react";
import { api, type Meta } from "./api";
import { About } from "./pages/About";
import { Architecture } from "./pages/Architecture";
import { Crops } from "./pages/Crops";
import { DataExplorer } from "./pages/DataExplorer";
import { EarlyWarning } from "./pages/EarlyWarning";
import { Home } from "./pages/Home";
import { Impacts } from "./pages/Impacts";
import { Monitor } from "./pages/Monitor";
import { Overview } from "./pages/Overview";
import { PakistanMap } from "./pages/PakistanMap";
import { Projections } from "./pages/Projections";
import { Risk } from "./pages/Risk";
import { Rivers } from "./pages/Rivers";
import { Trends } from "./pages/Trends";
import { WaterStorage } from "./pages/WaterStorage";
import { THEMES, useTheme } from "./theme";

// navigation: groups of [page key, label]
const NAV: { group: string; pages: [string, string][] }[] = [
  { group: "Monitor", pages: [["map", "Pakistan map (all data)"], ["overview", "Drought status"], ["monitor", "Drought monitor"], ["agri", "Agricultural"], ["rivers", "Rivers"], ["water", "Water storage"]] },
  { group: "Impacts & risk", pages: [["impacts", "Impacts"], ["crops", "Crops"], ["risk", "Risk zones"], ["trends", "Trends"]] },
  { group: "Outlook", pages: [["forecast", "Early warning"], ["projections", "Projections"]] },
  { group: "Data", pages: [["data", "Data explorer"], ["architecture", "Architecture"], ["about", "Data & methods"]] },
];
const LABEL: Record<string, string> = Object.fromEntries([["home", "Home"], ...NAV.flatMap((g) => g.pages)]);
const GROUP_OF: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.pages.map(([k]) => [k, g.group])));

// these pages fill the window without page scrolling (side panels scroll on their own)
const FIT_SCREEN = new Set(["home", "map", "overview", "monitor", "agri", "rivers", "water", "crops", "risk", "projections"]);

const initialPage = () => {
  const h = location.hash.slice(1);
  return h in LABEL ? h : "home";
};

export default function App() {
  const [page, setPage] = useState<string>(initialPage);
  const [open, setOpen] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [error, setError] = useState("");
  const { key: themeKey, setKey: setTheme } = useTheme();
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(String(e)));
    api.geo().then(setGeo).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (location.hash.slice(1) !== page) location.hash = page;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);
  useEffect(() => {
    const onHash = () => setPage(initialPage());
    const onClick = (e: MouseEvent) => { if (!nav.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const go = (p: string) => {
    setPage(p);
    setOpen(null);
  };

  return (
    <div className={`app ${FIT_SCREEN.has(page) ? "fit" : ""}`}>
      <header>
        <div className="brand">
          <button className="brand-home" onClick={() => go("home")} title="Home">
            <span className="logo">◐</span>
            <div>
              <div className="title">Pakistan Drought Monitoring Portal</div>
              <div className="subtitle">Meteorological · Agricultural · Hydrological drought — monitoring, early warning & climate outlook</div>
            </div>
          </button>
          <div className="theme-switch">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} className={k === themeKey ? "active" : ""} onClick={() => setTheme(k)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <nav className="menu" ref={nav}>
          <button className={`menu-top ${page === "home" ? "active" : ""}`} onClick={() => go("home")}>Home</button>
          {NAV.map((g) => (
            <div key={g.group} className={`menu-group ${open === g.group ? "open" : ""}`}
              onMouseEnter={() => setOpen(g.group)} onMouseLeave={() => setOpen(null)}>
              <button className={`menu-top ${GROUP_OF[page] === g.group ? "active" : ""}`}
                onClick={() => setOpen(open === g.group ? null : g.group)} aria-expanded={open === g.group}>
                {g.group} <span className="caret">▾</span>
              </button>
              <div className="menu-drop">
                {g.pages.map(([k, label]) => (
                  <button key={k} className={k === page ? "active" : ""} onClick={() => go(k)}>{label}</button>
                ))}
              </div>
            </div>
          ))}
          {page !== "home" && <div className="crumb">{GROUP_OF[page]} › <b>{LABEL[page]}</b></div>}
        </nav>
      </header>
      <main key={page} className="fade-in">
        {error && <div className="error">Could not reach the API: {error}. Is the backend running on port 8050?</div>}
        {!meta && !error && page !== "about" && page !== "architecture" && <div className="loading">Loading…</div>}
        {meta && page === "home" && <Home meta={meta} geo={geo} go={go} />}
        {meta && page === "map" && <PakistanMap meta={meta} geo={geo} />}
        {meta && page === "overview" && <Overview meta={meta} geo={geo} />}
        {meta && page === "monitor" && <Monitor meta={meta} geo={geo} key="met" initialCategory="meteorological" />}
        {meta && page === "agri" && <Monitor meta={meta} geo={geo} key="agr" initialCategory="agricultural" />}
        {meta && page === "rivers" && <Rivers meta={meta} geo={geo} />}
        {meta && page === "water" && <WaterStorage meta={meta} geo={geo} />}
        {meta && page === "impacts" && <Impacts meta={meta} geo={geo} />}
        {meta && page === "crops" && <Crops meta={meta} geo={geo} />}
        {meta && page === "trends" && <Trends meta={meta} />}
        {meta && page === "risk" && <Risk geo={geo} />}
        {meta && page === "forecast" && <EarlyWarning meta={meta} geo={geo} />}
        {meta && page === "projections" && <Projections meta={meta} geo={geo} />}
        {page === "data" && <DataExplorer />}
        {page === "architecture" && <Architecture />}
        {page === "about" && <About />}
      </main>
      <footer>
        <span>Pakistan Drought Monitoring Portal · open data · FastAPI + PostgreSQL + React</span>
        <span>
          <button className="link" onClick={() => go("architecture")}>Architecture</button> ·{" "}
          <button className="link" onClick={() => go("about")}>Data & methods</button> ·{" "}
          <a className="link" href="/docs" target="_blank" rel="noreferrer">API</a>
        </span>
      </footer>
    </div>
  );
}

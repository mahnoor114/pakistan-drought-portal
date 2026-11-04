import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "../theme";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

const HOME = { center: [69.4, 30.2] as [number, number], zoom: 4.55, pitch: 52, bearing: -12 };
const MAX_HEIGHT_M = 160_000; // extrusion height for value 1 (exaggerated for a country-scale view)

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  color: string;
  radius: number;
  pulse?: boolean;
  html: string;
  label?: string; // text shown beside the marker
}

interface Props {
  geo: GeoJSON.FeatureCollection | null;
  colorOf: (districtId: string) => string;
  tooltipOf: (districtId: string, name: string, province: string) => string;
  heightOf?: (districtId: string) => number; // 0..1, drier / riskier = taller
  selected?: string | null;
  onSelect?: (districtId: string) => void;
  points?: MapPoint[];
  selectedPoint?: string;
  onPointClick?: (id: string) => void;
  version: string; // changes whenever colours/heights change
  children?: React.ReactNode; // overlays (legend)
  provinces?: GeoJSON.FeatureCollection | null; // province outlines + labels drawn over the districts
}

/** Label point of a polygon feature: centre of its bounding box (good enough for province names). */
function labelPoints(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const xs: number[] = [], ys: number[] = [];
      const walk = (c: any) => (typeof c[0] === "number" ? (xs.push(c[0]), ys.push(c[1])) : c.forEach(walk));
      walk((f.geometry as any).coordinates);
      return {
        type: "Feature",
        properties: f.properties,
        geometry: { type: "Point", coordinates: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] },
      };
    }),
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function MapView(props: Props) {
  const { geo, version, points, selected, selectedPoint, children } = props;
  const { theme } = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [mode3d, setMode3d] = useState(true);
  const [spin, setSpin] = useState(false);
  const cb = useRef(props);
  cb.current = props;
  const heights = useRef<Record<string, number>>({});
  const anim = useRef<number>(0);

  // ---- create the map (once per theme) -----------------------------------
  useEffect(() => {
    if (!box.current) return;
    const m = new mapboxgl.Map({
      container: box.current,
      style: theme.mapStyle,
      center: HOME.center,
      zoom: 2.2,
      pitch: 0,
      bearing: 0,
      projection: "globe",
      antialias: true,
      attributionControl: true,
    });
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    m.addControl(new mapboxgl.FullscreenControl(), "top-right");
    m.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    m.on("style.load", () => {
      m.addSource("dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      m.setTerrain({ source: "dem", exaggeration: 1.5 });
      m.setFog(theme.fog as any);
      setReady(true);
      // cinematic fly-in from the globe to Pakistan
      m.flyTo({ ...HOME, duration: 3200, essential: true, curve: 1.6 });
    });
    return () => {
      setReady(false);
      cancelAnimationFrame(anim.current);
      m.remove();
      map.current = null;
      heights.current = {};
    };
  }, [theme.mapStyle]);

  // ---- districts source + layers ----------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !geo || m.getSource("districts")) return;
    m.addSource("districts", { type: "geojson", data: geo, promoteId: "district_id" });
    m.addLayer({
      id: "d-flat",
      type: "fill",
      source: "districts",
      paint: { "fill-color": ["coalesce", ["feature-state", "color"], "#9ca3af"], "fill-opacity": 0.82 },
      layout: { visibility: "none" },
    });
    m.addLayer({
      id: "d-3d",
      type: "fill-extrusion",
      source: "districts",
      paint: {
        "fill-extrusion-color": ["coalesce", ["feature-state", "color"], "#9ca3af"],
        "fill-extrusion-height": ["*", ["coalesce", ["feature-state", "h"], 0], MAX_HEIGHT_M],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.88,
        "fill-extrusion-vertical-gradient": true,
      },
    });
    m.addLayer({
      id: "d-line",
      type: "line",
      source: "districts",
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "sel"], false], theme.accent,
          ["boolean", ["feature-state", "hover"], false], theme.ink, theme.border],
        "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 3,
          ["boolean", ["feature-state", "hover"], false], 2, 0.5],
      },
    });

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: "map-popup", offset: 12 });
    let hovered: string | null = null;
    const onMove = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = f.properties!.district_id as string;
      if (hovered !== id) {
        if (hovered) m.setFeatureState({ source: "districts", id: hovered }, { hover: false });
        hovered = id;
        m.setFeatureState({ source: "districts", id }, { hover: true });
      }
      m.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat)
        .setHTML(cb.current.tooltipOf(id, f.properties!.district, f.properties!.province)).addTo(m);
    };
    const onLeave = () => {
      if (hovered) m.setFeatureState({ source: "districts", id: hovered }, { hover: false });
      hovered = null;
      m.getCanvas().style.cursor = "";
      popup.remove();
    };
    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.district_id;
      if (id) cb.current.onSelect?.(id);
    };
    for (const layer of ["d-3d", "d-flat"]) {
      m.on("mousemove", layer, onMove);
      m.on("mouseleave", layer, onLeave);
      m.on("click", layer, onClick);
    }
  }, [ready, geo, theme]);

  // ---- province outlines and names (optional) ------------------------------
  const { provinces } = props;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !provinces || !m.getLayer("d-line") || m.getSource("provinces")) return;
    m.addSource("provinces", { type: "geojson", data: provinces });
    m.addSource("province-labels", { type: "geojson", data: labelPoints(provinces) });
    m.addLayer({
      id: "prov-line", type: "line", source: "provinces",
      paint: { "line-color": theme.ink, "line-width": 1.8, "line-opacity": 0.85 },
    });
    m.addLayer({
      id: "prov-label", type: "symbol", source: "province-labels",
      layout: { "text-field": ["get", "province"], "text-size": 12, "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-letter-spacing": 0.05, "text-allow-overlap": false },
      paint: { "text-color": theme.ink, "text-halo-width": 1.4,
        "text-halo-color": theme.name === "Light" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)" },
    });
  }, [ready, geo, provinces, theme]);

  // ---- colours + animated heights whenever the data changes --------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !geo || !m.getSource("districts")) return;
    const ids = geo.features.map((f) => f.properties!.district_id as string);
    const target: Record<string, number> = {};
    for (const id of ids) {
      m.setFeatureState({ source: "districts", id }, { color: cb.current.colorOf(id) });
      const h = cb.current.heightOf?.(id) ?? 0.03;
      target[id] = Number.isFinite(h) ? Math.max(0.01, Math.min(1, h)) : 0.01;
    }
    const start = { ...heights.current };
    const t0 = performance.now();
    cancelAnimationFrame(anim.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 900);
      const k = easeInOut(t);
      for (const id of ids) {
        const h = (start[id] ?? 0) + (target[id] - (start[id] ?? 0)) * k;
        heights.current[id] = h;
        m.setFeatureState({ source: "districts", id }, { h });
      }
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [version, ready, geo]);

  // ---- selection outline + fly to the selected district ------------------
  const prevSel = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getSource("districts")) return;
    if (prevSel.current) m.setFeatureState({ source: "districts", id: prevSel.current }, { sel: false });
    if (selected) {
      m.setFeatureState({ source: "districts", id: selected }, { sel: true });
      const f = geo?.features.find((x) => x.properties!.district_id === selected);
      if (f) m.flyTo({ center: [f.properties!.lon, f.properties!.lat], zoom: 6.3, pitch: 58, duration: 1800 });
    } else if (prevSel.current) {
      m.flyTo({ ...HOME, duration: 1600 });
    }
    prevSel.current = selected ?? null;
  }, [selected, ready, geo]);

  // ---- point layer (rivers) with pulsing drought markers -----------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !points) return;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { id: p.id, color: p.color, radius: p.radius, pulse: !!p.pulse, html: p.html,
          sel: p.id === selectedPoint, label: p.label ?? "" },
      })),
    };
    const src = m.getSource("points") as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    m.addSource("points", { type: "geojson", data });
    m.addLayer({
      id: "p-pulse", type: "circle", source: "points", filter: ["==", ["get", "pulse"], true],
      paint: { "circle-color": ["get", "color"], "circle-radius": ["get", "radius"], "circle-opacity": 0.4,
        "circle-pitch-alignment": "map" },
    });
    m.addLayer({
      id: "p-dot", type: "circle", source: "points",
      paint: {
        "circle-color": ["get", "color"], "circle-radius": ["get", "radius"],
        "circle-stroke-color": ["case", ["get", "sel"], theme.accent, theme.ink],
        "circle-stroke-width": ["case", ["get", "sel"], 3, 1],
        "circle-pitch-alignment": "map",
      },
    });
    m.addLayer({
      id: "p-label", type: "symbol", source: "points",
      layout: { "text-field": ["get", "label"], "text-size": 11.5, "text-offset": [0, 1.15], "text-anchor": "top",
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"], "text-optional": true },
      paint: { "text-color": theme.ink, "text-halo-width": 1.4,
        "text-halo-color": theme.name === "Light" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)" },
    });
    const popup = new mapboxgl.Popup({ closeButton: false, className: "map-popup", offset: 10 });
    m.on("mouseenter", "p-dot", (e) => {
      m.getCanvas().style.cursor = "pointer";
      const f = e.features![0];
      popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(f.properties!.html).addTo(m);
    });
    m.on("mouseleave", "p-dot", () => { m.getCanvas().style.cursor = ""; popup.remove(); });
    m.on("click", "p-dot", (e) => cb.current.onPointClick?.(e.features![0].properties!.id));
  }, [points, selectedPoint, ready, theme]);

  // pulse animation for drought markers (independent of data updates)
  const hasPoints = !!points;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !hasPoints) return;
    let raf = 0;
    const pulse = (now: number) => {
      const t = (now % 1600) / 1600;
      if (m.getLayer("p-pulse")) {
        m.setPaintProperty("p-pulse", "circle-radius", ["+", ["get", "radius"], 4 + 18 * t]);
        m.setPaintProperty("p-pulse", "circle-opacity", 0.55 * (1 - t));
      }
      raf = requestAnimationFrame(pulse);
    };
    raf = requestAnimationFrame(pulse);
    return () => cancelAnimationFrame(raf);
  }, [ready, hasPoints]);

  // ---- 2D / 3D toggle ------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("d-3d")) return;
    m.setLayoutProperty("d-3d", "visibility", mode3d ? "visible" : "none");
    m.setLayoutProperty("d-flat", "visibility", mode3d ? "none" : "visible");
    m.easeTo({ pitch: mode3d ? HOME.pitch : 0, bearing: mode3d ? HOME.bearing : 0, duration: 1200 });
  }, [mode3d, ready]);

  // ---- slow orbit ------------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !spin) return;
    let raf = 0;
    let last = performance.now();
    const rotate = (now: number) => {
      m.setBearing(m.getBearing() + (now - last) * 0.006);
      last = now;
      raf = requestAnimationFrame(rotate);
    };
    raf = requestAnimationFrame(rotate);
    const stop = () => setSpin(false);
    m.once("mousedown", stop);
    m.once("touchstart", stop);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  return (
    <div className="mapbox-wrap">
      <div ref={box} className="mapbox" />
      <div className="map-buttons">
        <button className={mode3d ? "on" : ""} onClick={() => setMode3d((v) => !v)} title="3D extruded districts">
          {mode3d ? "3D" : "2D"}
        </button>
        <button className={spin ? "on" : ""} onClick={() => setSpin((v) => !v)} title="Orbit">⟳</button>
        <button onClick={() => map.current?.flyTo({ ...(mode3d ? HOME : { ...HOME, pitch: 0, bearing: 0 }), duration: 1600 })} title="Reset view">⌂</button>
      </div>
      {children}
    </div>
  );
}

export function Legend({ title, items, hint = "Height = drought severity / risk" }: { title: string; items: { color: string; label: string }[]; hint?: string }) {
  return (
    <div className="legend">
      <div className="legend-title">{title}</div>
      {items.map((it) => (
        <div key={it.label} className="legend-row">
          <span className="swatch" style={{ background: it.color }} />
          {it.label}
        </div>
      ))}
      <div className="legend-hint">{hint}</div>
    </div>
  );
}

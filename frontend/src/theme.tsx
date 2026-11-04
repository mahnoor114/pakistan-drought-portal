import { createContext, useContext, useEffect, useState } from "react";

/** Colour themes. To use your own palette, edit the values below (CSS variables + map style). */
export interface Theme {
  name: string;
  mapStyle: string;
  fog: Record<string, unknown>;
  accent: string;
  ink: string;
  border: string;
  css: Record<string, string>;
}

export const THEMES: Record<string, Theme> = {
  dark: {
    name: "Dark",
    mapStyle: "mapbox://styles/mapbox/dark-v11",
    fog: { color: "#0b1020", "high-color": "#1e293b", "horizon-blend": 0.08, "space-color": "#020617", "star-intensity": 0.5 },
    accent: "#f59e0b",
    ink: "#f8fafc",
    border: "#334155",
    css: {
      "--bg": "#0b1120",
      "--panel": "#111827",
      "--panel-2": "#0f172a",
      "--ink": "#e5e7eb",
      "--muted": "#94a3b8",
      "--line": "#1f2937",
      "--accent": "#f59e0b",
      "--accent-ink": "#111827",
      "--header": "linear-gradient(90deg, #0f172a 0%, #1e1b4b 55%, #7c2d12 120%)",
      "--glow": "0 0 0 1px rgba(245,158,11,.25), 0 10px 30px rgba(0,0,0,.45)",
    },
  },
  light: {
    name: "Light",
    mapStyle: "mapbox://styles/mapbox/light-v11",
    fog: { color: "#ffffff", "high-color": "#bfdbfe", "horizon-blend": 0.06, "space-color": "#dbeafe", "star-intensity": 0 },
    accent: "#b45309",
    ink: "#111827",
    border: "#a8a29e",
    css: {
      "--bg": "#f5f5f4",
      "--panel": "#ffffff",
      "--panel-2": "#fafaf9",
      "--ink": "#1c1917",
      "--muted": "#78716c",
      "--line": "#e7e5e4",
      "--accent": "#b45309",
      "--accent-ink": "#ffffff",
      "--header": "linear-gradient(90deg, #292524 0%, #44403c 60%, #92400e 120%)",
      "--glow": "0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)",
    },
  },
};

const Ctx = createContext<{ theme: Theme; key: string; setKey: (k: string) => void }>({
  theme: THEMES.dark,
  key: "dark",
  setKey: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem("theme") ?? "dark";
    } catch {
      return "dark";
    }
  });
  const theme = THEMES[key] ?? THEMES.dark;
  useEffect(() => {
    for (const [k, v] of Object.entries(theme.css)) document.documentElement.style.setProperty(k, v);
    document.documentElement.dataset.theme = key;
    try {
      localStorage.setItem("theme", key);
    } catch {
      /* ignore */
    }
  }, [theme, key]);
  return <Ctx.Provider value={{ theme, key, setKey }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

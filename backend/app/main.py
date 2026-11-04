"""
Pakistan Drought Monitoring Portal - API (FastAPI + PostgreSQL).

    cd portal/backend
    python -m uvicorn app.main:app --port 8050

All data is read from PostgreSQL (schema "drought", database "landslide portal 2 "; see app/db.py
and portal/backend/.env). When portal/frontend/dist exists the web app is served too.
"""

import json
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import explorer, layers, themes
from .db import clean, columns, q, records, scalar, t
from .indicators import CATEGORIES, INDICATORS

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

app = FastAPI(title="Pakistan Drought Monitoring Portal", version="2.0",
              description="Drought monitoring API backed by PostgreSQL (schema `drought`).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
app.include_router(themes.router)
app.include_router(explorer.router)
app.include_router(layers.router)

DM = "portal_district_monthly"


def check_indicator(name, table=DM):
    if name not in INDICATORS:
        raise HTTPException(404, f"unknown indicator '{name}'")
    if name not in columns(table):
        raise HTTPException(404, f"indicator '{name}' is not in {table}")


@lru_cache
def dates():
    return q(f"SELECT DISTINCT date FROM {t(DM)} ORDER BY date").date.tolist()


@lru_cache
def document(name):
    doc = scalar(f"SELECT doc FROM {t('portal_documents')} WHERE name = :n", n=name)
    if doc is None:
        raise HTTPException(404, f"document '{name}' not loaded")
    return json.loads(doc)


# ---------------------------------------------------------------------------
# Metadata and geometry
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"database": "ok", "district_rows": scalar(f"SELECT count(*) FROM {t(DM)}")}


@app.get("/api/meta")
def meta():
    districts = q(f"SELECT district_id, district, province FROM {t('portal_districts')} ORDER BY province, district")
    available = {k: v for k, v in INDICATORS.items() if k in columns(DM)}
    return {
        "title": "Pakistan Drought Monitoring Portal",
        "dates": dates(),
        "latest_date": dates()[-1],
        "provinces": sorted(districts.province.unique().tolist()),
        "districts": records(districts),
        "indicators": available,
        "categories": CATEGORIES,
    }


@lru_cache
def _geojson():
    df = q(f"SELECT * FROM {t('portal_districts')}")
    props = [c for c in df.columns if c != "geometry_geojson"]
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": json.loads(r["geometry_geojson"]),
         "properties": {c: r[c] for c in props}} for r in records(df)]}


@app.get("/api/geo/districts")
def districts_geo():
    return _geojson()


# ---------------------------------------------------------------------------
# Maps and time series
# ---------------------------------------------------------------------------

@app.get("/api/map")
def map_values(indicator: str, date: str):
    check_indicator(indicator)
    sub = q(f'SELECT district_id, "{indicator}" AS v FROM {t(DM)} WHERE date = :d', d=date)
    if sub.empty:
        raise HTTPException(404, f"no data for {date}")
    return {"indicator": indicator, "date": date, "values": dict(zip(sub.district_id, clean(sub.v.tolist())))}


@app.get("/api/timeseries/district/{district_id}")
def district_series(district_id: str, indicators: str = Query(..., description="comma separated")):
    names = [i for i in indicators.split(",") if i]
    for n in names:
        check_indicator(n)
    cols = ", ".join(f'"{n}"' for n in names)
    sub = q(f"SELECT district, province, date, {cols} FROM {t(DM)} WHERE district_id = :i ORDER BY year, month",
            i=district_id)
    if sub.empty:
        raise HTTPException(404, "unknown district")
    return {"district": sub.district.iloc[0], "province": sub.province.iloc[0],
            "dates": sub.date.tolist(), "series": {n: clean(sub[n].tolist()) for n in names}}


@app.get("/api/timeseries/region")
def region_series(indicators: str, level: str = "national", name: str | None = None):
    names = [i for i in indicators.split(",") if i]
    for n in names:
        check_indicator(n)
    table = "portal_province_monthly" if level == "province" else "portal_national_monthly"
    have = [n for n in names if n in columns(table)]
    cols = "".join(f', "{n}"' for n in have)
    where = "WHERE province = :p" if level == "province" else ""
    df = q(f"SELECT date{cols} FROM {t(table)} {where} ORDER BY year, month", p=name)
    if df.empty:
        raise HTTPException(404, "no data")
    return {"level": level, "name": name or "Pakistan", "dates": df.date.tolist(),
            "series": {n: clean(df[n].tolist()) if n in have else [] for n in names}}


# ---------------------------------------------------------------------------
# Drought status, trends, risk
# ---------------------------------------------------------------------------

@app.get("/api/status")
def drought_status(date: str | None = None):
    date = date or dates()[-1]
    sub = q(f"SELECT district_id, district, province, met_class, agr_class, hyd_class, drought_class, alert "
            f"FROM {t('portal_status')} WHERE date = :d", d=date)
    return {"date": date, "counts": sub.alert.value_counts().to_dict(), "districts": records(sub)}


@app.get("/api/trends")
def trends(indicator: str = "spei_3"):
    """Share of districts (and of each province) in drought per year."""
    check_indicator(indicator)
    info = INDICATORS[indicator]
    if "drought_threshold" not in info:
        raise HTTPException(400, "indicator has no drought threshold")
    op = "<=" if info.get("drought_below", True) else ">="
    df = q(f'SELECT province, year, (avg(("{indicator}" {op} :thr)::int) * 100)::float8 AS pct, '
           f'avg("{indicator}")::float8 AS mean '
           f'FROM {t(DM)} WHERE "{indicator}" IS NOT NULL GROUP BY GROUPING SETS ((year), (province, year)) '
           f'ORDER BY year', thr=info["drought_threshold"])
    nat = df[df.province.isna()]
    prov = df[df.province.notna()].pivot(index="year", columns="province", values="pct").reindex(nat.year)
    return {"indicator": indicator, "years": nat.year.astype(int).tolist(),
            "national_pct_in_drought": clean(nat.pct.round(1).tolist()),
            "national_mean": clean(nat["mean"].round(3).tolist()),
            "provinces": {p: clean(prov[p].round(1).tolist()) for p in prov.columns}}


@app.get("/api/risk")
def risk():
    return {"method": "risk = 0.5*hazard + 0.25*exposure + 0.25*vulnerability (each scaled 0-1 across "
                      "districts); classes are quartiles. Hazard: frequency/severity of SPEI-3<=-1 and VHI<=0.4, "
                      "agricultural drought risk, groundwater (GRACE) decline. Exposure: cropland share, "
                      "population density. Vulnerability: water deficit, low rainfall.",
            "districts": records(q(f"SELECT * FROM {t('portal_risk')}"))}


# ---------------------------------------------------------------------------
# Early warning (AI forecasts)
# ---------------------------------------------------------------------------

@app.get("/api/forecast")
def forecast(target: str = "spei_3"):
    f = q(f"SELECT district_id, district, province, lead, valid_date, value, drought, class "
          f"FROM {t('portal_forecast')} WHERE target = :tg", tg=target)
    if f.empty:
        raise HTTPException(404, "unknown target")
    return {"target": target, "issued_from": document("model_skill")["issued_from"],
            "valid_dates": sorted(f.valid_date.unique().tolist()), "districts": records(f)}


@app.get("/api/forecast/skill")
def forecast_skill():
    return document("model_skill")


# ---------------------------------------------------------------------------
# Rivers and events
# ---------------------------------------------------------------------------

RIVER_COLS = ("discharge_mean_m3s", "sri_3", "sri_6", "discharge_pct_of_normal")


@app.get("/api/rivers")
def rivers(date: str | None = None):
    date = date or scalar(f"SELECT max(date) FROM {t('portal_rivers')}")
    cur = q(f"SELECT station, {', '.join(RIVER_COLS)} FROM {t('portal_rivers')} WHERE date = :d",
            d=date).set_index("station")
    stations = [dict(s) for s in document("river_stations")]
    for s in stations:
        row = cur.loc[s["station"]] if s["station"] in cur.index else None
        for c in RIVER_COLS:
            s[c] = None if row is None or row[c] != row[c] else round(float(row[c]), 2)
    return {"date": date, "stations": stations}


@app.get("/api/rivers/{station}")
def river_series(station: str):
    sub = q(f"SELECT * FROM {t('portal_rivers')} WHERE station = :s ORDER BY year, month", s=station)
    if sub.empty:
        raise HTTPException(404, "unknown station")
    return {"station": station, "river": sub.river.iloc[0], "dates": sub.date.tolist(),
            **{c: clean(sub[c].tolist()) for c in ("discharge_mean_m3s", "discharge_min_m3s",
                                                  "discharge_max_m3s", "sri_3", "sri_6",
                                                  "discharge_pct_of_normal")}}


@app.get("/api/events")
def events():
    return {"events": records(q(f"SELECT * FROM {t('portal_events')} ORDER BY start_date"))}


# ---------------------------------------------------------------------------
# Web app
# ---------------------------------------------------------------------------

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")

"""Map layers: every district-level table in the database becomes a choosable map layer.

A layer is (table, numeric column). Tables are found automatically: any table in the schema with a
district_id column. Time is monthly (year + month), yearly (year) or static. Text columns with few
distinct values (scenario, model, ssp, ...) become dimensions the map can filter on.
"""

import json
import re
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Query

from sqlalchemy import text

from .db import clean, engine, q, t, tables

router = APIRouter(prefix="/api")

KEY_COLS = {"district_id", "district", "province", "year", "month", "date", "lat", "lon", "area_km2"}
NUMERIC = {"double precision", "bigint", "integer", "real", "numeric", "smallint"}
SKIP_TABLES = re.compile(r"^(portal_districts|nasa_power_district_points|districts|from_rasters_districts|boundary_)")
MAX_DIM_VALUES = 40
# text columns that split one district-time into several rows (others, like alert classes, are outcomes)
DIMENSIONS = {"scenario", "model", "ssp", "variable", "validity", "analysis", "period_from", "season",
              "ensemble_stat", "target"}


def group_of(table: str) -> str:
    rules = [
        (r"^(spi_|portal_status|pakistan_drought)", "Drought indices & status"),
        (r"(rain|chirps|cru_|gpcc|precip)", "Rainfall & climate observations"),
        (r"(terraclimate|climate_water|nasa_power|era5|ncep|district_rasters)", "Climate & water balance"),
        (r"(modis|vhi|ndvi|fapar|agri)", "Vegetation & agriculture"),
        (r"(soil|grace|groundwater|surface_water|water_storage)", "Soil moisture & groundwater"),
        (r"(isimip|cmip6|projection)", "Climate projections"),
        (r"(population|census|worldcover|landcover)", "People & land"),
        (r"(ipc|crop|gdhy|punjab|faostat)", "Impacts & crops"),
        (r"^portal_", "Portal outputs"),
    ]
    for pat, g in rules:
        if re.search(pat, table):
            return g
    return "Other"


def nice(col: str) -> str:
    return col.replace("_", " ")


@lru_cache
def catalog():
    """Layer catalogue, read from the layer_catalog table (scanning every table is slow on a cold disk)."""
    if "layer_catalog" in tables():
        rows = q(f"SELECT table_name, info FROM {t('layer_catalog')}")
        if len(rows):
            return {r.table_name: json.loads(r.info) for r in rows.itertuples()}
    return build_catalog()


def save_catalog():
    """Rebuild the layer_catalog table: `cd portal/backend && python -m app.layers`."""
    cat = build_catalog()
    with engine.begin() as c:
        c.execute(text(f"DROP TABLE IF EXISTS {t('layer_catalog')}"))
        c.execute(text(f"CREATE TABLE {t('layer_catalog')} (table_name text PRIMARY KEY, info text) TABLESPACE drought_ts"))
        c.execute(text(f"INSERT INTO {t('layer_catalog')} VALUES (:n, :i)"),
                  [{"n": k, "i": json.dumps(v)} for k, v in cat.items()])
    print(f"layer_catalog: {len(cat)} tables")


def build_catalog():
    """{table: {...}} for every district table, with numeric columns, dimensions and time type."""
    out = {}
    for table, cols in tables().items():
        if "district_id" not in cols or SKIP_TABLES.search(table):
            continue
        numeric = [c for c, ty in cols.items() if ty in NUMERIC and c not in KEY_COLS and not c.endswith("_id")]
        if not numeric:
            continue
        time = "monthly" if {"year", "month"} <= set(cols) else "yearly" if "year" in cols else "static"
        dims = {}
        for c, ty in cols.items():
            if ty == "text" and c in DIMENSIONS:
                vals = q(f'SELECT DISTINCT "{c}" AS v FROM {t(table)} WHERE "{c}" IS NOT NULL ORDER BY 1 LIMIT {MAX_DIM_VALUES + 1}').v.tolist()
                if 1 < len(vals) <= MAX_DIM_VALUES:
                    dims[c] = vals
        span = None
        if time != "static":
            r = q(f"SELECT min(year) AS a, max(year) AS b FROM {t(table)}").iloc[0]
            span = [int(r.a), int(r.b)] if r.a is not None else None
        out[table] = {"table": table, "group": group_of(table), "time": time, "span": span,
                      "dimensions": dims, "columns": [{"name": c, "label": nice(c)} for c in numeric]}
    return out


def check(table, column):
    cat = catalog()
    if table not in cat:
        raise HTTPException(404, f"'{table}' is not a district table")
    if column not in {c["name"] for c in cat[table]["columns"]}:
        raise HTTPException(404, f"'{column}' is not a numeric column of {table}")
    return cat[table]


def dim_filter(info, dims: list[str] | None):
    """'col:value' strings -> SQL + params; dimensions not given default to their first value."""
    given = {}
    for d in dims or []:
        c, _, v = d.partition(":")
        if c not in info["dimensions"]:
            raise HTTPException(400, f"unknown dimension '{c}'")
        given[c] = v
    parts, params, used = [], {}, {}
    for i, (c, vals) in enumerate(info["dimensions"].items()):
        v = given.get(c, vals[0])
        parts.append(f'"{c}" = :d{i}')
        params[f"d{i}"] = v
        used[c] = v
    return parts, params, used


@router.get("/layers")
def layers():
    groups = {}
    for info in catalog().values():
        groups.setdefault(info["group"], []).append(info)
    return {"groups": [{"group": g, "tables": sorted(v, key=lambda x: x["table"])} for g, v in sorted(groups.items())]}


@router.get("/layers/times")
def layer_times(table: str, column: str, dim: list[str] | None = Query(None)):
    """Time steps with data for this layer (newest last)."""
    info = check(table, column)
    if info["time"] == "static":
        return {"time": "static", "steps": []}
    parts, params, _ = dim_filter(info, dim)
    where = " AND ".join([f'"{column}" IS NOT NULL'] + parts)
    sel = "year, month" if info["time"] == "monthly" else "year"
    df = q(f"SELECT DISTINCT {sel} FROM {t(table)} WHERE {where} ORDER BY {sel}", **params)
    steps = ([f"{int(r.year)}-{int(r.month):02d}" for r in df.itertuples()] if info["time"] == "monthly"
             else [str(int(y)) for y in df.year])
    return {"time": info["time"], "steps": steps}


def when_clause(info, when):
    if info["time"] == "static" or not when:
        return [], {}
    if info["time"] == "monthly":
        y, m = when.split("-")
        return ["year = :y", "month = :m"], {"y": int(y), "m": int(m)}
    return ["year = :y"], {"y": int(when)}


@router.get("/layers/values")
def layer_values(table: str, column: str, when: str | None = None, dim: list[str] | None = Query(None)):
    """District values of one layer at one time step (averaged if a district has several rows)."""
    info = check(table, column)
    parts, params, used = dim_filter(info, dim)
    wp, wparams = when_clause(info, when)
    where = " AND ".join(parts + wp) or "TRUE"
    df = q(f'SELECT district_id, avg("{column}")::float8 AS v FROM {t(table)} WHERE {where} GROUP BY district_id',
           **params, **wparams)
    vals = df.v.dropna()
    stats = None
    if len(vals):
        qs = vals.quantile([0.02, 0.5, 0.98]).tolist()
        stats = {"min": float(vals.min()), "p02": qs[0], "median": qs[1], "p98": qs[2], "max": float(vals.max())}
    return {"table": table, "column": column, "when": when, "dimensions": used,
            "values": dict(zip(df.district_id, clean(df.v.tolist()))), "stats": stats}


@router.get("/layers/series")
def layer_series(table: str, column: str, district_id: str, dim: list[str] | None = Query(None)):
    """Full time series of one layer for one district."""
    info = check(table, column)
    parts, params, used = dim_filter(info, dim)
    where = " AND ".join(['district_id = :i'] + parts)
    if info["time"] == "static":
        df = q(f'SELECT avg("{column}")::float8 AS v FROM {t(table)} WHERE {where}', i=district_id, **params)
        return {"time": "static", "dates": [], "values": clean(df.v.tolist())}
    sel = "year, month" if info["time"] == "monthly" else "year"
    df = q(f'SELECT {sel}, avg("{column}")::float8 AS v FROM {t(table)} WHERE {where} GROUP BY {sel} ORDER BY {sel}',
           i=district_id, **params)
    dates = ([f"{int(r.year)}-{int(r.month):02d}" for r in df.itertuples()] if info["time"] == "monthly"
             else [str(int(y)) for y in df.year])
    return {"time": info["time"], "dates": dates, "values": clean(df.v.tolist()), "dimensions": used}


@router.get("/districts/{district_id}/profile")
def district_profile(district_id: str):
    """Static facts about a district from several tables."""
    d = q(f"SELECT district_id, district, province, area_km2, lat, lon FROM {t('portal_districts')} WHERE district_id = :i",
          i=district_id)
    if d.empty:
        raise HTTPException(404, "unknown district")
    out = {k: (None if v != v else v) for k, v in d.iloc[0].to_dict().items()}
    try:
        p = q(f"SELECT year, population FROM {t('population_worldpop_r2025a_district')} WHERE district_id = :i "
              f"AND year <= EXTRACT(YEAR FROM now()) ORDER BY year DESC LIMIT 1", i=district_id)  # not a projection
        if len(p):
            out["population"], out["population_year"] = float(p.population.iloc[0]), int(p.year.iloc[0])
        lc = q(f"SELECT cropland_pct, built_pct, bare_pct, tree_pct FROM {t('worldcover_2021_district')} WHERE district_id = :i",
               i=district_id)
        if len(lc):
            out.update({k: float(v) for k, v in lc.iloc[0].items()})
        r = q(f"SELECT risk_class, risk_score FROM {t('portal_risk')} WHERE district_id = :i", i=district_id)
        if len(r):
            out["risk_class"], out["risk_score"] = r.risk_class.iloc[0], float(r.risk_score.iloc[0])
        s = q(f"SELECT date, alert FROM {t('portal_status')} WHERE district_id = :i ORDER BY date DESC LIMIT 1", i=district_id)
        if len(s):
            out["status"], out["status_date"] = s.alert.iloc[0], s.date.iloc[0]
    except Exception:
        pass
    return out


@lru_cache
def _provinces():
    df = q(f"SELECT shapename AS province, geometry_geojson FROM {t('boundary_adm1')}")
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"province": r.province}, "geometry": json.loads(r.geometry_geojson)}
        for r in df.itertuples()]}


@router.get("/geo/provinces")
def provinces():
    return _provinces()


if __name__ == "__main__":
    save_catalog()

"""API for the datasets added in Drought_Data/csv/alternatives and the climate projections:
groundwater (GRACE), reservoirs (Landsat), drought impacts (IPC, ASAP, GDACS), crop statistics,
population and CMIP6 / ISIMIP3b projections. All read from PostgreSQL."""

from functools import lru_cache

from fastapi import APIRouter, HTTPException

from .db import clean, q, records, t

router = APIRouter(prefix="/api")


def series(df, cols, date="date"):
    return {"dates": df[date].tolist(), "series": {c: clean(df[c].tolist()) for c in cols}}


# ---------------------------------------------------------------------------
# Groundwater (CSR GRACE mascons, derived groundwater storage anomaly)
# ---------------------------------------------------------------------------

GW = "grace_csr_groundwater_district"
GW_VARS = {
    "ggdi": dict(label="Groundwater drought index (GGDI)", unit="std. anomaly", scale="drought", mid=0, min=-2.5, max=2.5,
                 drought_threshold=-1.0),
    "gwsa_tc_mm": dict(label="Groundwater storage anomaly", unit="mm", scale="drought", mid=0, min=-300, max=300),
    "csr_tws_anomaly_mm": dict(label="Total water storage anomaly", unit="mm", scale="drought", mid=0, min=-300, max=300),
}


@router.get("/groundwater/meta")
@lru_cache
def groundwater_meta():
    d = q(f"SELECT DISTINCT date FROM {t(GW)} ORDER BY date").date.tolist()
    return {"dates": d, "variables": GW_VARS,
            "source": "CSR GRACE/GRACE-FO RL06.3 mascons; groundwater = TWS - TerraClimate soil moisture - SWE "
                      "(anomalies vs 2004-2009). GGDI standardises groundwater per calendar month."}


@router.get("/groundwater/map")
def groundwater_map(date: str, var: str = "ggdi"):
    if var not in GW_VARS:
        raise HTTPException(404, "unknown variable")
    df = q(f'SELECT district_id, "{var}" AS v FROM {t(GW)} WHERE date = :d', d=date)
    return {"date": date, "var": var, "values": dict(zip(df.district_id, clean(df.v.tolist())))}


@router.get("/groundwater/district/{district_id}")
def groundwater_district(district_id: str):
    df = q(f"SELECT * FROM {t(GW)} WHERE district_id = :i ORDER BY year, month", i=district_id)
    if df.empty:
        raise HTTPException(404, "unknown district")
    return {"district": df.district.iloc[0], "province": df.province.iloc[0],
            **series(df, ["csr_tws_anomaly_mm", "gwsa_tc_mm", "gwsa_cpc_mm", "ggdi"])}


@router.get("/groundwater/national")
@lru_cache
def groundwater_national():
    df = q(f"""SELECT g.date, sum(g.csr_tws_anomaly_mm * d.area_km2) / sum(d.area_km2) AS csr_tws_anomaly_mm,
                      sum(g.gwsa_tc_mm * d.area_km2) / nullif(sum(CASE WHEN g.gwsa_tc_mm IS NOT NULL
                          THEN d.area_km2 END), 0) AS gwsa_tc_mm
               FROM {t(GW)} g JOIN {t('portal_districts')} d USING (district_id)
               GROUP BY g.date ORDER BY g.date""")
    return series(df, ["csr_tws_anomaly_mm", "gwsa_tc_mm"])


# ---------------------------------------------------------------------------
# Reservoirs (Landsat water surface area)
# ---------------------------------------------------------------------------

RES = "reservoir_water_area_landsat"


@router.get("/reservoirs")
def reservoirs(date: str | None = None):
    st = q(f"SELECT reservoir, (west + east) / 2 AS lon, (south + north) / 2 AS lat FROM {t('reservoirs')}")
    stats = q(f"SELECT reservoir, max(max_extent_km2) AS max_extent_km2, "
              f"percentile_cont(0.5) WITHIN GROUP (ORDER BY water_area_km2) AS median_area_km2, "
              f"min(date) AS first, max(date) AS last, count(*) AS months FROM {t(RES)} GROUP BY reservoir")
    date = date or q(f"SELECT max(date) AS d FROM {t(RES)}").d.iloc[0]
    cur = q(f"SELECT reservoir, scene_date, water_area_km2, water_pct_of_max, area_anomaly_pct, quality "
            f"FROM {t(RES)} WHERE date = :d", d=date)
    out = st.merge(stats, on="reservoir").merge(cur, on="reservoir", how="left")
    return {"date": date, "reservoirs": records(out)}


@router.get("/reservoirs/{name}")
def reservoir_series(name: str):
    df = q(f"SELECT * FROM {t(RES)} WHERE reservoir = :n ORDER BY year, month", n=name)
    if df.empty:
        raise HTTPException(404, "unknown reservoir")
    return {"reservoir": name, "quality": df.quality.tolist(), "platform": df.platform.tolist(),
            **series(df, ["water_area_km2", "water_pct_of_max", "area_anomaly_pct"])}


# ---------------------------------------------------------------------------
# Drought impacts
# ---------------------------------------------------------------------------

IPC = "ipc_food_insecurity_district"


@router.get("/impacts/ipc/periods")
def ipc_periods():
    df = q(f"SELECT analysis, validity, period_from, period_to, count(*) AS districts, "
           f"sum(pop_phase3plus) AS pop_phase3plus FROM {t(IPC)} "
           f"GROUP BY analysis, validity, period_from, period_to ORDER BY period_from DESC, analysis")
    return {"periods": records(df)}


@router.get("/impacts/ipc")
def ipc(analysis: str, validity: str, period_from: str):
    df = q(f"SELECT * FROM {t(IPC)} WHERE analysis = :a AND validity = :v AND period_from = :p "
           f"ORDER BY pct_phase3plus DESC", a=analysis, v=validity, p=period_from)
    return {"districts": records(df)}


@router.get("/impacts/ipc/district/{district_id}")
def ipc_district(district_id: str):
    df = q(f"SELECT * FROM {t(IPC)} WHERE district_id = :i ORDER BY period_from, analysis", i=district_id)
    areas = q(f"SELECT DISTINCT ipc_area, match FROM {t('ipc_food_insecurity_area')} WHERE district_id = :i",
              i=district_id)
    return {"history": records(df), "ipc_areas": records(areas)}


@router.get("/impacts/asap")
def asap():
    return {"rows": records(q(f"SELECT * FROM {t('asap_agricultural_hotspots_pakistan')} ORDER BY date DESC"))}


@router.get("/impacts/gdacs")
def gdacs():
    return {"rows": records(q(f"SELECT * FROM {t('gdacs_drought_alerts_pakistan')} ORDER BY from_date DESC"))}


# ---------------------------------------------------------------------------
# Crops
# ---------------------------------------------------------------------------

@router.get("/crops/national")
@lru_cache
def crops_national():
    df = q(f"SELECT * FROM {t('faostat_crops_pakistan_national')} ORDER BY crop, year")
    return {"source": "FAOSTAT (via HDX)", "crops": {
        c: {"years": g.year.astype(int).tolist(), "area_ha": clean(g.area_ha.tolist()),
            "production_t": clean(g.production_t.tolist()), "yield_kg_ha": clean(g.yield_kg_ha.tolist())}
        for c, g in df.groupby("crop")}}


GDHY = "gdhy_crop_yield_district"
GDHY_CROPS = ("wheat", "rice", "maize")
MAIN_CROPS = ["Wheat", "Rice", "Maize (corn)", "Sugar cane", "Seed cotton, unginned"]


@router.get("/cultivation")
@lru_cache
def cultivation():
    """Everything the home dashboard needs: cropland, crop health, drought status and yields per district."""
    d = q(f"SELECT p.district_id, p.district, p.province, p.lat, p.lon, l.cropland_pct, l.cropland_km2 "
          f"FROM {t('portal_districts')} p JOIN {t('worldcover_2021_district')} l USING (district_id)")
    st_date = q(f"SELECT max(date) AS d FROM {t('portal_status')}").d.iloc[0]
    st = q(f"SELECT district_id, alert FROM {t('portal_status')} WHERE date = :d", d=st_date)
    vh_date = q(f"SELECT max(date) AS d FROM {t('modis_ndvi_lst_vhi_district')} WHERE vhi_cropland IS NOT NULL").d.iloc[0]
    vh = q(f"SELECT district_id, vhi_cropland FROM {t('modis_ndvi_lst_vhi_district')} WHERE date = :d", d=vh_date)
    yr = int(q(f"SELECT max(year) AS y FROM {t(GDHY)} WHERE gdhy_wheat_t_ha IS NOT NULL").y.iloc[0])
    y = q(f"SELECT district_id, gdhy_wheat_t_ha AS wheat, gdhy_rice_t_ha AS rice, gdhy_maize_t_ha AS maize "
          f"FROM {t(GDHY)} WHERE year = :y", y=yr)
    d = d.merge(st, on="district_id", how="left").merge(vh, on="district_id", how="left").merge(y, on="district_id", how="left")
    d.loc[d.cropland_pct < 5, list(GDHY_CROPS)] = None  # 0.5 deg yields are unreliable with little cropland

    fy = int(q(f"SELECT max(year) AS y FROM {t('faostat_crops_pakistan_national')}").y.iloc[0])
    f = q(f"SELECT crop, area_ha, production_t, yield_kg_ha FROM {t('faostat_crops_pakistan_national')} "
          f"WHERE year = :y", y=fy).set_index("crop").reindex(MAIN_CROPS).reset_index()

    dry = d.alert.isin(["Alert", "Warning"])
    prov = d.groupby("province", as_index=False).cropland_km2.sum().sort_values("cropland_km2", ascending=False)
    return {"status_date": st_date, "vhi_date": vh_date, "yield_year": yr, "crop_year": fy,
            "cropland_km2": float(d.cropland_km2.sum()),
            "cropland_in_drought_pct": round(float(d.cropland_km2[dry].sum() / d.cropland_km2.sum() * 100), 1),
            "districts": records(d), "provinces": records(prov), "crops": records(f)}


@router.get("/crops/map")
def crops_map(crop: str = "wheat", year: int = 2016):
    if crop not in GDHY_CROPS:
        raise HTTPException(404, "unknown crop")
    col = f"gdhy_{crop}_t_ha"
    df = q(f'SELECT district_id, year, "{col}" AS y, cropland_pct FROM {t(GDHY)}')
    mean = df.groupby("district_id").y.transform("mean")
    df["anomaly_pct"] = (df.y / mean - 1) * 100
    sub = df[df.year == year]
    return {"crop": crop, "year": year, "years": sorted(df.year.dropna().astype(int).unique().tolist()),
            "yield_t_ha": dict(zip(sub.district_id, clean(sub.y.tolist()))),
            "anomaly_pct": dict(zip(sub.district_id, clean(sub.anomaly_pct.tolist()))),
            "cropland_pct": dict(zip(sub.district_id, clean(sub.cropland_pct.tolist())))}


@router.get("/crops/district/{district_id}")
def crops_district(district_id: str):
    g = q(f"SELECT * FROM {t(GDHY)} WHERE district_id = :i ORDER BY year", i=district_id)
    p = q(f"SELECT * FROM {t('punjab_wheat_district')} WHERE district_id = :i ORDER BY year", i=district_id)
    return {"gdhy": {"years": g.year.astype(int).tolist(), **{c: clean(g[f"gdhy_{c}_t_ha"].tolist()) for c in GDHY_CROPS},
                     "cropland_pct": None if g.empty else g.cropland_pct.iloc[0]},
            "punjab_wheat": records(p)}


# ---------------------------------------------------------------------------
# Population
# ---------------------------------------------------------------------------

@router.get("/population/district/{district_id}")
def population_district(district_id: str):
    old = q(f"SELECT year, population FROM {t('population_district_yearly')} WHERE district_id = :i ORDER BY year",
            i=district_id)
    new = q(f"SELECT year, population FROM {t('population_worldpop_r2025a_district')} WHERE district_id = :i "
            f"ORDER BY year", i=district_id)
    census = q(f"SELECT * FROM {t('census_2017_district')} WHERE district_id = :i", i=district_id)
    return {"worldpop_2000_2020": records(old), "worldpop_r2025a_2015_2030": records(new),
            "census_2017": records(census)[0] if len(census) else None}


# ---------------------------------------------------------------------------
# Climate projections
# ---------------------------------------------------------------------------

ISI_ENS, ISI_MOD = "isimip3b_cmip6_ensemble_district", "isimip3b_cmip6_monthly_district"
ISI_VARS = {  # column -> label, unit, annual aggregation
    "pr_mm": ("Precipitation", "mm/year", "sum"),
    "tas_c": ("Mean temperature", "°C", "avg"),
    "tasmax_c": ("Max temperature", "°C", "avg"),
    "tasmin_c": ("Min temperature", "°C", "avg"),
    "hurs_pct": ("Relative humidity", "%", "avg"),
    "rsds_wm2": ("Solar radiation", "W/m²", "avg"),
    "sfcwind_ms": ("Wind speed", "m/s", "avg"),
}
SCENARIOS = {"historical": "Historical", "ssp126": "SSP1-2.6 (low)", "ssp370": "SSP3-7.0 (high)",
             "ssp585": "SSP5-8.5 (very high)"}
BASE = (1985, 2014)


def check_var(v):
    if v not in ISI_VARS:
        raise HTTPException(404, "unknown variable")
    return ISI_VARS[v]


@router.get("/projections/meta")
@lru_cache
def projections_meta():
    cckp = q(f"SELECT variable, min(description) AS description, array_agg(DISTINCT scenario) AS scenarios "
             f"FROM {t('cckp_cmip6_pakistan_annual')} GROUP BY variable ORDER BY variable")
    models = q(f"SELECT DISTINCT model FROM {t(ISI_MOD)} ORDER BY model").model.tolist()
    return {"isimip_variables": {k: {"label": v[0], "unit": v[1]} for k, v in ISI_VARS.items()},
            "scenarios": SCENARIOS, "models": models, "baseline": BASE,
            "cckp_variables": records(cckp)}


@router.get("/projections/district/{district_id}")
def projections_district(district_id: str, variable: str = "tas_c"):
    label, unit, agg = check_var(variable)
    df = q(f'SELECT scenario, model, year, {agg}("{variable}")::float8 AS v FROM {t(ISI_MOD)} '
           f"WHERE district_id = :i GROUP BY scenario, model, year ORDER BY year", i=district_id)
    if df.empty:
        raise HTTPException(404, "unknown district")
    g = df.groupby(["scenario", "year"]).v.agg(["mean", "min", "max"]).reset_index()
    out = {}
    for s, x in g.groupby("scenario"):
        out[s] = {"years": x.year.astype(int).tolist(), "mean": clean(x["mean"].tolist()),
                  "min": clean(x["min"].tolist()), "max": clean(x["max"].tolist())}
    return {"variable": variable, "label": label, "unit": unit, "scenarios": out}


@router.get("/projections/map")
def projections_map(variable: str = "tas_c", scenario: str = "ssp585", start: int = 2031, end: int = 2040):
    label, unit, agg = check_var(variable)
    if scenario not in SCENARIOS or scenario == "historical":
        raise HTTPException(404, "unknown scenario")
    df = q(f'SELECT district_id, scenario, year, {agg}("{variable}")::float8 AS v FROM {t(ISI_ENS)} '
           f"WHERE (scenario = 'historical' AND year BETWEEN :b0 AND :b1) OR (scenario = :s AND year BETWEEN :y0 AND :y1) "
           f"GROUP BY district_id, scenario, year", b0=BASE[0], b1=BASE[1], s=scenario, y0=start, y1=end)
    m = df.groupby(["district_id", "scenario"]).v.mean().unstack()
    if variable == "pr_mm":
        change, cunit = (m[scenario] / m["historical"] - 1) * 100, "%"
    else:
        change, cunit = m[scenario] - m["historical"], unit
    return {"variable": variable, "label": label, "scenario": scenario, "period": [start, end], "baseline": BASE,
            "change_unit": cunit, "change": dict(zip(change.index, clean(change.round(3).tolist()))),
            "baseline_value": dict(zip(m.index, clean(m["historical"].round(2).tolist())))}


@router.get("/projections/national")
def projections_national(variable: str = "tas"):
    df = q(f"SELECT scenario, ensemble_stat, year, value, description FROM {t('cckp_cmip6_pakistan_annual')} "
           f"WHERE variable = :v ORDER BY year", v=variable)
    if df.empty:
        raise HTTPException(404, "unknown variable")
    out = {}
    for s, x in df.groupby("scenario"):
        w = x.pivot_table(index="year", columns="ensemble_stat", values="value")
        out[s] = {"years": w.index.astype(int).tolist(), **{c: clean(w[c].tolist()) for c in w.columns}}
    return {"variable": variable, "description": df.description.iloc[0], "source": "World Bank CCKP (CMIP6)",
            "scenarios": out}

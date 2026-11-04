"""
Build everything the portal API serves, from Drought_Data/csv.

    python prepare.py            (writes portal/backend/data/*)

Outputs
    district_monthly.parquet   master table (district x month)
    province_monthly.parquet, national_monthly.parquet
    districts.geojson          simplified boundaries (EPSG:4326)
    status.parquet             combined drought status per district/month
    rivers.parquet, river_stations.json   monthly discharge + SRI-3 / SRI-6
    risk.parquet               drought risk zones (hazard / exposure / vulnerability)
    forecast.parquet           AI forecasts (SPEI-3, VHI) 1-3 months after the last month
    model_skill.json           test-period skill vs persistence / climatology
    events.parquet             JRC historical drought events (Pakistan)
"""

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "Drought_Data" / "csv"
OUT = Path(__file__).resolve().parent / "data"
KEYS = ["district_id", "district", "province", "year", "month", "date"]


# ---------------------------------------------------------------------------
# Base tables and geometry
# ---------------------------------------------------------------------------

def base_tables():
    d = pd.read_csv(CSV / "pakistan_drought_monthly_district.csv")
    d.to_parquet(OUT / "district_monthly.parquet", index=False)
    pd.read_csv(CSV / "pakistan_drought_monthly_province.csv").to_parquet(OUT / "province_monthly.parquet", index=False)
    pd.read_csv(CSV / "pakistan_drought_monthly_national.csv").to_parquet(OUT / "national_monthly.parquet", index=False)

    g = gpd.read_file(ROOT / "Drought_Data" / "boundary" / "pakistan_adm2.geojson")
    meta = pd.read_csv(CSV / "from_rasters" / "districts.csv")
    g = g.rename(columns={"shapeID": "district_id"})[["district_id", "geometry"]].merge(meta, on="district_id")
    g["geometry"] = g.geometry.simplify(0.01, preserve_topology=True)
    pts = g.representative_point()
    g["lat"], g["lon"] = pts.y.round(4), pts.x.round(4)
    g["area_km2"] = g.area_km2.round(1)
    g.to_file(OUT / "districts.geojson", driver="GeoJSON")
    print(f"tables: {d.shape}, districts: {len(g)}")
    return d, g


# ---------------------------------------------------------------------------
# Combined drought status (meteorological / agricultural / hydrological)
# ---------------------------------------------------------------------------

def spei_class(x):
    return np.select([x <= -2, x <= -1.5, x <= -1, x <= -0.5], [4, 3, 2, 1], 0).astype(float)


def vhi_class(x):  # Khan et al. (2026): <=0.1 extreme ... <=0.4 mild
    return np.select([x <= 0.1, x <= 0.2, x <= 0.3, x <= 0.4], [4, 3, 2, 1], 0).astype(float)


def status(d):
    s = d[KEYS].copy()
    met = spei_class(d.spei_3)
    met[d.spei_3.isna()] = np.nan
    agr = vhi_class(d.vhi)
    agr[d.vhi.isna()] = np.nan
    # where VHI is missing (MODIS gap) use the fAPAR anomaly as agricultural signal
    fap = spei_class(d.gdo_fapar_anomaly)
    agr = np.where(np.isnan(agr) & d.gdo_fapar_anomaly.notna(), fap, agr)
    hyd_src = d.gdo_soil_moisture_anomaly.fillna(d.spei_12)
    hyd = spei_class(hyd_src)
    hyd[hyd_src.isna()] = np.nan
    s["met_class"], s["agr_class"], s["hyd_class"] = met, agr, hyd
    stack = np.vstack([met, agr, hyd])
    s["drought_class"] = np.nanmax(stack, axis=0)
    n_dry = (stack >= 2).sum(axis=0)
    # simple combined-indicator style alert levels
    s["alert"] = np.select([n_dry >= 2, n_dry == 1, s.drought_class >= 1], ["Alert", "Warning", "Watch"], "Normal")
    s.to_parquet(OUT / "status.parquet", index=False)
    print("status:", s.alert.value_counts().to_dict())
    return s


# ---------------------------------------------------------------------------
# Rivers: Standardized Runoff Index (GEV per calendar month, as Rahman et al. 2023)
# ---------------------------------------------------------------------------

def sri(series, months, k):
    acc = series.rolling(k, min_periods=k).mean().to_numpy()
    out = np.full(len(acc), np.nan)
    for m in range(1, 13):
        sel = (months == m) & ~np.isnan(acc)
        x = acc[sel]
        if len(x) < 10:
            continue
        try:
            c, loc, scale = stats.genextreme.fit(x)
            cdf = stats.genextreme.cdf(x, c, loc=loc, scale=scale)
        except Exception:
            cdf = stats.norm.cdf(x, x.mean(), x.std())
        out[sel] = stats.norm.ppf(np.clip(cdf, 0.00135, 0.99865))
    return out


def rivers():
    m = pd.read_csv(CSV / "open_api" / "river_discharge_monthly.csv")
    st = pd.read_csv(CSV / "open_api" / "river_stations.csv")
    parts = []
    for name, g in m.groupby("station", sort=False):
        g = g.sort_values(["year", "month"]).copy()
        months = g.month.to_numpy()
        g["sri_3"] = sri(g.discharge_mean_m3s, months, 3)
        g["sri_6"] = sri(g.discharge_mean_m3s, months, 6)
        clim = g.groupby("month").discharge_mean_m3s.transform("mean")
        g["discharge_pct_of_normal"] = 100 * g.discharge_mean_m3s / clim
        parts.append(g)
    r = pd.concat(parts)
    r.to_parquet(OUT / "rivers.parquet", index=False)
    st = st.rename(columns={"lat_glofas": "lat", "lon_glofas": "lon"})
    (OUT / "river_stations.json").write_text(st[["station", "river", "lat", "lon", "mean_discharge_m3s"]]
                                            .to_json(orient="records"))
    print(f"rivers: {len(r)} rows, {r.station.nunique()} stations")


# ---------------------------------------------------------------------------
# Risk zones: hazard x exposure x vulnerability (normalised 0-1)
# ---------------------------------------------------------------------------

def norm(x):
    x = x.astype(float)
    lo, hi = np.nanpercentile(x, 2), np.nanpercentile(x, 98)
    return ((x - lo) / (hi - lo)).clip(0, 1)


def risk(d, g):
    grp = d.groupby("district_id")
    r = pd.DataFrame(index=g.district_id)
    # hazard: how often and how badly drought occurs (2000-2025)
    r["freq_spei3_drought"] = grp.apply(lambda x: (x.spei_3 <= -1).mean(), include_groups=False)
    r["mean_spei3_in_drought"] = grp.apply(lambda x: -x.spei_3[x.spei_3 <= -1].mean(), include_groups=False)
    r["freq_vhi_drought"] = grp.apply(lambda x: (x.vhi <= 0.4).sum() / max(x.vhi.notna().sum(), 1),
                                      include_groups=False)
    r["mean_agri_risk"] = grp.gdo_agri_drought_risk.mean()

    def slope(x):
        y = x.gdo_grace_tws_anomaly.to_numpy()
        t = (x.year + (x.month - 1) / 12).to_numpy()
        ok = ~np.isnan(y)
        return np.polyfit(t[ok], y[ok], 1)[0] * 10 if ok.sum() > 24 else np.nan

    r["grace_trend_per_decade"] = grp.apply(slope, include_groups=False)
    # exposure: farmland and people
    static = d.drop_duplicates("district_id").set_index("district_id")
    pop = d[d.year == d.loc[d.population.notna(), "year"].max()].drop_duplicates("district_id").set_index("district_id")
    r["cropland_pct"] = static.cropland_pct
    r["population"] = pop.population
    r["density_per_km2"] = pop.density_per_km2
    # vulnerability: aridity and dependence on scarce water
    r["mean_water_deficit_mm"] = grp.tc_water_deficit_mm.mean()
    r["mean_annual_rain_mm"] = grp.rain_mm.mean() * 12

    hazard = pd.concat([norm(r.freq_spei3_drought), norm(r.mean_spei3_in_drought.fillna(0)),
                        norm(r.freq_vhi_drought), norm(r.mean_agri_risk.fillna(r.mean_agri_risk.median())),
                        norm(-r.grace_trend_per_decade.fillna(0))], axis=1).mean(axis=1)
    exposure = pd.concat([norm(r.cropland_pct), norm(np.log1p(r.density_per_km2))], axis=1).mean(axis=1)
    vulner = pd.concat([norm(r.mean_water_deficit_mm), norm(-np.log1p(r.mean_annual_rain_mm))], axis=1).mean(axis=1)
    r["hazard"], r["exposure"], r["vulnerability"] = hazard.round(3), exposure.round(3), vulner.round(3)
    r["risk_score"] = (0.5 * hazard + 0.25 * exposure + 0.25 * vulner).round(3)
    r["risk_class"] = pd.qcut(r.risk_score, 4, labels=["Low", "Moderate", "High", "Very high"]).astype(str)
    r = r.reset_index().merge(g[["district_id", "district", "province"]], on="district_id")
    r.to_parquet(OUT / "risk.parquet", index=False)
    print("risk:", r.risk_class.value_counts().to_dict())
    return r


# ---------------------------------------------------------------------------
# AI early warning: gradient boosting, SPEI-3 and VHI, leads 1-3 months
# ---------------------------------------------------------------------------

ANOM = ["rain_mm", "tc_soil_moisture_mm", "tc_tmax_c", "tc_water_deficit_mm", "tc_swe_mm", "ndvi",
        "lst_day_c", "power_soil_wetness_root_0_1", "cpc_soil_moisture_mm", "tc_runoff_mm"]
DIRECT = ["spi_1", "spi_3", "spi_6", "spi_12", "spei_1", "spei_3", "spei_6", "spei_12", "tc_pdsi",
          "vhi", "vci", "tci", "gdo_fapar_anomaly", "gdo_soil_moisture_anomaly", "gdo_grace_tws_anomaly"]
CLIMATE = ["nino34_anom", "oni", "dmi_iod", "pdo", "soi", "ao", "nao", "mei_v2"]
STATIC = ["cropland_pct", "bare_pct", "tree_pct", "snow_ice_pct", "lat", "lon", "clim_rain"]
TARGETS = {"spei_3": "SPEI-3", "vhi": "VHI"}
LEADS = (1, 2, 3)
TRAIN_END, VALID_END = 2018, 2021  # test = 2022-2025


def features(d, g):
    f = d[KEYS].copy()
    f = f.merge(g[["district_id", "lat", "lon"]], on="district_id")
    for c in ANOM:  # anomaly vs. the district's calendar-month mean
        clim = d.groupby(["district_id", "month"])[c].transform("mean")
        f[f"{c}_anom"] = d[c] - clim
    for c in DIRECT + CLIMATE:
        f[c] = d[c]
    f["clim_rain"] = d.groupby("district_id").rain_mm.transform("mean")
    for c in ["cropland_pct", "bare_pct", "tree_pct", "snow_ice_pct"]:
        f[c] = d[c]
    f = f.sort_values(["district_id", "year", "month"]).reset_index(drop=True)
    by = f.groupby("district_id")
    for c in ["spei_3", "spi_3", "vhi", "rain_mm_anom", "gdo_soil_moisture_anomaly"]:
        for lag in (1, 2):
            f[f"{c}_lag{lag}"] = by[c].shift(lag)
    for c in ["nino34_anom", "dmi_iod"]:
        f[f"{c}_lag3"] = by[c].shift(3)
    f["m_sin"], f["m_cos"] = np.sin(2 * np.pi * f.month / 12), np.cos(2 * np.pi * f.month / 12)
    return f


def skill(y, p, threshold, below=True):
    ok = ~np.isnan(y) & ~np.isnan(p)
    y, p = y[ok], p[ok]
    obs = y <= threshold if below else y >= threshold
    pred = p <= threshold if below else p >= threshold
    hits, misses, fa = (obs & pred).sum(), (obs & ~pred).sum(), (~obs & pred).sum()
    return {"n": int(ok.sum()), "rmse": round(float(np.sqrt(np.mean((y - p) ** 2))), 3),
            "corr": round(float(np.corrcoef(y, p)[0, 1]), 3),
            "pod": round(float(hits / max(hits + misses, 1)), 3),
            "far": round(float(fa / max(hits + fa, 1)), 3),
            "f1": round(float(2 * hits / max(2 * hits + misses + fa, 1)), 3)}


def gbm():
    return HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31,
                                         min_samples_leaf=40, l2_regularization=1.0, random_state=0)


def fit_predict(kind, X, y, cur, fit_rows, pred_rows):
    """kind 'direct' predicts y; 'change' predicts y - current value (falls back to direct
    where the current value is missing)."""
    direct = gbm().fit(X[fit_rows], y[fit_rows])
    p = direct.predict(X[pred_rows])
    if kind == "change":
        rows = fit_rows & cur.notna()
        delta = gbm().fit(X[rows], (y - cur)[rows])
        c = cur[pred_rows].to_numpy()
        has = ~np.isnan(c)
        p[has] = c[has] + delta.predict(X[pred_rows][has])
    return p


def model(d, g):
    f = features(d, g)
    feat_cols = [c for c in f.columns if c not in KEYS]
    X = f[feat_cols]
    by = f.groupby("district_id")
    report, forecasts = {}, []
    last_rows = (f.year == f.year.max()) & (f.month == f[f.year == f.year.max()].month.max())
    last = f[last_rows]
    for tgt, label in TARGETS.items():
        thr = -1.0 if tgt == "spei_3" else 0.4
        cur = f[tgt]
        for lead in LEADS:
            y = by[tgt].shift(-lead)
            ty = f.year + (f.month - 1 + lead) // 12
            ok = y.notna()
            tr, va, te = ok & (ty <= TRAIN_END), ok & (ty > TRAIN_END) & (ty <= VALID_END), ok & (ty > VALID_END)
            # choose the formulation on the validation years only
            val_rmse = {}
            for kind in ("direct", "change"):
                pv = fit_predict(kind, X, y, cur, tr, va)
                yv = y[va].to_numpy()
                m = ~np.isnan(pv) & ~np.isnan(yv)
                val_rmse[kind] = float(np.sqrt(np.mean((pv[m] - yv[m]) ** 2)))
            kind = min(val_rmse, key=val_rmse.get)
            p = fit_predict(kind, X, y, cur, tr | va, te)
            yt = y[te].to_numpy()
            persist = cur[te].to_numpy()
            clim = f.loc[te].merge(f.loc[tr].assign(yy=y[tr]).groupby(["district_id", "month"]).yy.mean()
                                   .rename("c").reset_index(), on=["district_id", "month"], how="left").c.to_numpy()
            same = ~np.isnan(persist)  # compare all methods on the same months
            report[f"{tgt}_lead{lead}"] = {
                "target": label, "lead_months": lead, "formulation": kind,
                "test_years": f"{VALID_END + 1}-{f.year.max()}",
                "model": skill(yt[same], p[same], thr), "persistence": skill(yt[same], persist[same], thr),
                "climatology": skill(yt[same], clim[same], thr)}
            # refit on all data and forecast from the last month
            fc = last[["district_id", "district", "province"]].copy()
            fc["target"], fc["lead"] = tgt, lead
            per = pd.Period(f"{int(last.year.iloc[0])}-{int(last.month.iloc[0]):02d}", "M") + lead
            fc["valid_date"] = str(per)
            fc["value"] = np.round(fit_predict(kind, X, y, cur, ok, last_rows), 3)
            fc["drought"] = fc.value <= thr
            forecasts.append(fc)
            r = report[f"{tgt}_lead{lead}"]
            print(f"  {label} lead {lead} [{kind}]: corr {r['model']['corr']} (persist {r['persistence']['corr']}), "
                  f"F1 {r['model']['f1']} (persist {r['persistence']['f1']})", flush=True)
    fc = pd.concat(forecasts)
    fc["class"] = np.where(fc.target == "spei_3", spei_class(fc.value), vhi_class(fc.value))
    fc.to_parquet(OUT / "forecast.parquet", index=False)
    (OUT / "model_skill.json").write_text(json.dumps({
        "method": "Gradient boosting (HistGradientBoostingRegressor) per target and lead. For each, a "
                  "'direct' or 'change from current value' formulation is chosen on 2019-2021; skill is "
                  "reported on 2022-2025, which the model never saw. Forecasts use a refit on all data.",
        "features": feat_cols, "issued_from": str(last.date.iloc[0]), "skill": report}, indent=1))


def events():
    parts = []
    for f in sorted((CSV / "open_api").glob("drought_events_pakistan_*.csv")):
        e = pd.read_csv(f)
        if len(e):
            e["index"] = f.stem.split("_")[-1]
            parts.append(e)
    ev = pd.concat(parts)[["index", "START_DATE", "PEAK_DATE", "END_DATE", "DURATION", "SEVERITY",
                           "INTENSITY", "WIDEST_AREA_PERC"]]
    ev.columns = [c.lower() for c in ev.columns]
    ev.to_parquet(OUT / "events.parquet", index=False)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    d, g = base_tables()
    status(d)
    rivers()
    risk(d, g)
    events()
    model(d, g)
    print("done ->", OUT)


if __name__ == "__main__":
    main()

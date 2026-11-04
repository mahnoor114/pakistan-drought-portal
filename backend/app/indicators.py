"""Indicator metadata used by the API and the map legend.

scale: "drought" (red = dry, blue = wet, diverging around `mid`), "seq" (sequential),
"seq_r" (sequential, high = bad). drought_threshold / drought_below define 'in drought'.
"""

CATEGORIES = {
    "meteorological": "Meteorological drought",
    "agricultural": "Agricultural drought",
    "hydrological": "Hydrological drought",
    "climate": "Climate",
    "exposure": "Land & people",
}

_SPI = dict(scale="drought", mid=0, min=-2.5, max=2.5, unit="index", drought_threshold=-1.0, drought_below=True)

INDICATORS = {
    # meteorological
    "spi_1": dict(label="SPI-1", category="meteorological", **_SPI, source="CHIRPS"),
    "spi_3": dict(label="SPI-3", category="meteorological", **_SPI, source="CHIRPS"),
    "spi_6": dict(label="SPI-6", category="meteorological", **_SPI, source="CHIRPS"),
    "spi_12": dict(label="SPI-12", category="meteorological", **_SPI, source="CHIRPS"),
    "spei_1": dict(label="SPEI-1", category="meteorological", **_SPI, source="CHIRPS + TerraClimate"),
    "spei_3": dict(label="SPEI-3", category="meteorological", **_SPI, source="CHIRPS + TerraClimate"),
    "spei_6": dict(label="SPEI-6", category="meteorological", **_SPI, source="CHIRPS + TerraClimate"),
    "spei_12": dict(label="SPEI-12", category="meteorological", **_SPI, source="CHIRPS + TerraClimate"),
    "rain_mm": dict(label="Rainfall", category="meteorological", scale="seq", min=0, max=200, unit="mm/month",
                    source="CHIRPS"),
    "tc_pdsi": dict(label="PDSI", category="meteorological", scale="drought", mid=0, min=-5, max=5,
                    unit="index", drought_threshold=-2.0, drought_below=True, source="TerraClimate"),
    # agricultural
    "vhi": dict(label="VHI (vegetation health)", category="agricultural", scale="drought", mid=0.4, min=0,
                max=0.8, unit="0-1", drought_threshold=0.4, drought_below=True, source="MODIS"),
    "vhi_cropland": dict(label="VHI over cropland", category="agricultural", scale="drought", mid=0.4, min=0,
                         max=0.8, unit="0-1", drought_threshold=0.4, drought_below=True, source="MODIS + WorldCover"),
    "vci": dict(label="VCI (vegetation condition)", category="agricultural", scale="drought", mid=0.4, min=0,
                max=0.8, unit="0-1", drought_threshold=0.4, drought_below=True, source="MODIS"),
    "tci": dict(label="TCI (temperature condition)", category="agricultural", scale="drought", mid=0.4, min=0,
                max=0.8, unit="0-1", drought_threshold=0.4, drought_below=True, source="MODIS"),
    "ndvi": dict(label="NDVI", category="agricultural", scale="seq", min=0, max=0.6, unit="index", source="MODIS"),
    "lst_day_c": dict(label="Land surface temperature", category="agricultural", scale="seq_r", min=0, max=50,
                      unit="°C", source="MODIS"),
    "vhi_severe_area_pct": dict(label="Area in severe VHI drought", category="agricultural", scale="seq_r",
                                min=0, max=40, unit="% of district", source="MODIS"),
    "gdo_fapar_anomaly": dict(label="fAPAR anomaly", category="agricultural", **{**_SPI, "unit": "std. anomaly"},
                              source="Copernicus GDO (VIIRS)"),
    "gdo_agri_drought_risk": dict(label="Agricultural drought risk", category="agricultural", scale="seq_r",
                                  min=0, max=3, unit="0-3", source="Copernicus GDO"),
    "tc_soil_moisture_mm": dict(label="Soil moisture", category="agricultural", scale="seq", min=0, max=100,
                                unit="mm", source="TerraClimate"),
    "power_soil_wetness_root_0_1": dict(label="Root-zone soil wetness", category="agricultural", scale="seq",
                                        min=0, max=1, unit="0-1", source="NASA POWER"),
    "gdo_soil_moisture_anomaly": dict(label="Soil moisture anomaly", category="agricultural",
                                      **{**_SPI, "unit": "std. anomaly"}, source="Copernicus GDO"),
    # hydrological
    "gdo_grace_tws_anomaly": dict(label="Water storage anomaly (GRACE)", category="hydrological",
                                  **{**_SPI, "unit": "std. anomaly"}, source="Copernicus GDO / GRACE"),
    "tc_runoff_mm": dict(label="Runoff", category="hydrological", scale="seq", min=0, max=50, unit="mm/month",
                         source="TerraClimate"),
    "tc_swe_mm": dict(label="Snow water equivalent", category="hydrological", scale="seq", min=0, max=200,
                      unit="mm", source="TerraClimate"),
    "cpc_soil_moisture_mm": dict(label="Soil moisture (CPC)", category="hydrological", scale="seq", min=0,
                                 max=400, unit="mm", source="NOAA CPC"),
    # climate
    "tc_tmax_c": dict(label="Max temperature", category="climate", scale="seq_r", min=0, max=45, unit="°C",
                      source="TerraClimate"),
    "tc_tmin_c": dict(label="Min temperature", category="climate", scale="seq_r", min=-15, max=30, unit="°C",
                      source="TerraClimate"),
    "tc_pet_mm": dict(label="Potential evapotranspiration", category="climate", scale="seq_r", min=0, max=250,
                      unit="mm/month", source="TerraClimate"),
    "tc_aet_mm": dict(label="Actual evapotranspiration", category="climate", scale="seq", min=0, max=120,
                      unit="mm/month", source="TerraClimate"),
    "tc_water_deficit_mm": dict(label="Climatic water deficit", category="climate", scale="seq_r", min=0,
                                max=250, unit="mm/month", source="TerraClimate"),
    "tc_vpd_kpa": dict(label="Vapour pressure deficit", category="climate", scale="seq_r", min=0, max=5,
                       unit="kPa", source="TerraClimate"),
    "power_rh_pct": dict(label="Relative humidity", category="climate", scale="seq", min=0, max=100, unit="%",
                         source="NASA POWER"),
    # exposure
    "cropland_pct": dict(label="Cropland", category="exposure", scale="seq", min=0, max=100, unit="% of district",
                         source="ESA WorldCover 2021"),
    "density_per_km2": dict(label="Population density", category="exposure", scale="seq_r", min=0, max=1500,
                            unit="people/km²", source="WorldPop"),
}

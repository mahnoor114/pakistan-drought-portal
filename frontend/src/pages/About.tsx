const SOURCES = [
  ["Rainfall", "CHIRPS v2.0 (UCSB/IRI), NASA POWER", "1981–2025, monthly, 5 km"],
  ["SPI / SPEI", "Computed from CHIRPS + TerraClimate PET (gamma / log-logistic, 1991–2020 baseline)", "1981–2025"],
  ["Temperature, PET/AET, water deficit, VPD, snow, runoff, PDSI", "TerraClimate (built from ERA5)", "2000–2025, 4 km"],
  ["Weather & soil wetness (3 depths)", "NASA POWER (MERRA-2)", "2000–2025"],
  ["Soil moisture", "NOAA CPC; Copernicus GDO soil moisture anomaly", "2000–2026"],
  ["NDVI, land surface temperature, ET", "MODIS MOD13A1 / MOD11A2 / MOD16A3GF (Microsoft Planetary Computer)", "2000–2025 (gap Mar 2024–Jun 2025)"],
  ["VCI / TCI / VHI", "Computed from MODIS (Kogan; Khan et al. 2026), VHI ≤ 0.4 = drought", "2000–2025"],
  ["Groundwater / water storage", "GRACE/GRACE-FO via Copernicus Global Drought Observatory", "2002–2026"],
  ["Vegetation anomaly, agricultural drought risk", "Copernicus GDO (fAPAR VIIRS, RDrI-Agri)", "2010/2012–2026"],
  ["River discharge, SRI", "GloFAS (Open-Meteo Flood API); SRI GEV per month (Rahman et al. 2023)", "2000–2025, 15 sites"],
  ["Land cover / cropland", "ESA WorldCover 2021", "static"],
  ["Population", "WorldPop 1 km (UN adjusted)", "2000–2020"],
  ["Climate drivers", "NOAA PSL/CPC: Niño3.4, ONI, MEI, IOD, PDO, SOI, AO, NAO", "1950–2026"],
  ["Historical drought events", "JRC Global Drought Events database", "1951–2016"],
  ["District boundaries", "geoBoundaries (ADM2, 126 districts)", ""],
];

export function About() {
  return (
    <section className="panel about">
      <h2>About this portal</h2>
      <p>
        The Pakistan Drought Monitoring Portal tracks <b>meteorological</b> (rainfall deficit),{" "}
        <b>agricultural</b> (crop and vegetation stress) and <b>hydrological</b> (rivers, soil moisture, groundwater)
        drought for all 126 districts, monthly from 2000, and issues AI early-warning forecasts 1–3 months ahead.
        All data are open and free.
      </p>
      <h3>Data sources</h3>
      <table className="grid">
        <thead><tr><th>Variable</th><th>Source</th><th>Coverage</th></tr></thead>
        <tbody>{SOURCES.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table>
      <h3>Drought classes</h3>
      <table className="grid">
        <thead><tr><th>Class</th><th>SPI / SPEI / SRI</th><th>VHI</th></tr></thead>
        <tbody>
          <tr><td>Mild</td><td>−0.5 … −1.0</td><td>0.3 … 0.4</td></tr>
          <tr><td>Moderate</td><td>−1.0 … −1.5</td><td>0.2 … 0.3</td></tr>
          <tr><td>Severe</td><td>−1.5 … −2.0</td><td>0.1 … 0.2</td></tr>
          <tr><td>Extreme</td><td>≤ −2.0</td><td>≤ 0.1</td></tr>
        </tbody>
      </table>
      <h3>Methods</h3>
      <ul>
        <li><b>Combined status</b>: Alert = moderate-or-worse drought in 2+ of meteorological (SPEI-3), agricultural (VHI, fAPAR where VHI is missing) and hydrological (soil moisture anomaly); Warning = in one; Watch = mild dryness.</li>
        <li><b>Risk zones</b>: risk = 0.5·hazard + 0.25·exposure + 0.25·vulnerability, each scaled 0–1 across districts; classes are quartiles.</li>
        <li><b>Early warning</b>: gradient-boosting models per target and lead time using drought indices, soil moisture, vegetation, groundwater and climate drivers (ENSO, IOD…); evaluated on 2022–2025 against persistence and climatology.</li>
      </ul>
      <h3>Limitations</h3>
      <ul>
        <li>MODIS NDVI/VHI is missing March 2024 – June 2025 in the open archive; fAPAR is used there.</li>
        <li>GloFAS river flows are modelled and do not fully include canal withdrawals; reservoir levels are not public.</li>
        <li>Satellite/reanalysis data should be validated against PMD/WAPDA station records where available.</li>
      </ul>
      <p className="muted">References: Rahman et al. (2023) J. Hydrometeorology 24:601; Khan et al. (2026) Theor. Appl. Climatol. 157:180.</p>
    </section>
  );
}

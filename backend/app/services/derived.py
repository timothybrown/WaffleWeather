"""Derived weather calculations computed on the fly, not stored in DB.

- Dew point: Magnus-Tetens formula (a=17.625, b=243.04)
- Heat index: Full NWS Rothfusz algorithm with adjustments
- Wind chill: NWS / Environment Canada formula
- Feels like: Composite (wind chill < 10°C, heat index > 27°C, actual otherwise)
"""

import math


def dew_point(temp_c: float, rh_percent: float) -> float:
    """Dew-point temperature (°C) via Magnus-Tetens approximation."""
    a = 17.625
    b = 243.04
    es = 6.112 * math.exp((a * temp_c) / (temp_c + b))
    e = (rh_percent / 100.0) * es
    if e <= 0:
        return temp_c  # Edge case: RH effectively 0
    gamma = math.log(e / 6.112)
    return round((b * gamma) / (a - gamma), 1)


def heat_index(temp_c: float, rh_percent: float) -> float | None:
    """Heat index (°C) using the full NWS algorithm.

    Returns None when conditions are outside the meaningful range
    (T < 27°C / 80°F), since heat index only applies in warm conditions.
    """
    T = temp_c * 9.0 / 5.0 + 32.0  # Convert to °F
    RH = rh_percent

    # Step 1: Simple formula
    hi = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094))

    # Step 2: If average of simple HI and T < 80°F, heat index not applicable
    if (hi + T) / 2.0 < 80.0:
        return None

    # Step 3: Full Rothfusz regression
    hi = (
        -42.379
        + 2.04901523 * T
        + 10.14333127 * RH
        - 0.22475541 * T * RH
        - 0.00683783 * T**2
        - 0.05481717 * RH**2
        + 0.00122874 * T**2 * RH
        + 0.00085282 * T * RH**2
        - 0.00000199 * T**2 * RH**2
    )

    # Step 4: Low-RH adjustment (RH < 13% and 80 ≤ T ≤ 112°F)
    if RH < 13.0 and 80.0 <= T <= 112.0:
        hi -= ((13.0 - RH) / 4.0) * math.sqrt((17.0 - abs(T - 95.0)) / 17.0)

    # Step 5: High-RH adjustment (RH > 85% and 80 ≤ T ≤ 87°F)
    if RH > 85.0 and 80.0 <= T <= 87.0:
        hi += ((RH - 85.0) / 10.0) * ((87.0 - T) / 5.0)

    # Convert back to °C
    return round((hi - 32.0) * 5.0 / 9.0, 1)


def wind_chill(temp_c: float, wind_kmh: float) -> float | None:
    """Wind chill (°C) using the NWS / Environment Canada formula.

    Valid for T ≤ 10°C and wind speed > 4.8 km/h.
    Returns None when conditions are outside the valid range.
    """
    if temp_c > 10.0 or wind_kmh <= 4.8:
        return None

    wc = (
        13.12
        + 0.6215 * temp_c
        - 11.37 * wind_kmh**0.16
        + 0.3965 * temp_c * wind_kmh**0.16
    )
    return round(wc, 1)


def feels_like(
    temp_c: float, rh_percent: float, wind_kmh: float | None
) -> float:
    """Composite 'feels like' temperature (°C).

    - Above 27°C: heat index
    - Below 10°C with wind > 4.8 km/h: wind chill
    - Otherwise: actual temperature
    """
    if temp_c > 27.0:
        hi = heat_index(temp_c, rh_percent)
        return hi if hi is not None else round(temp_c, 1)

    if temp_c < 10.0 and wind_kmh is not None and wind_kmh > 4.8:
        wc = wind_chill(temp_c, wind_kmh)
        return wc if wc is not None else round(temp_c, 1)

    return round(temp_c, 1)


def enrich_observation(obs: dict) -> dict:
    """Add derived fields to an observation dict (for WebSocket broadcast).

    Only computes values when the required inputs are present and
    the derived field is not already populated.
    """
    temp = obs.get("temp_outdoor")
    rh = obs.get("humidity_outdoor")
    wind = obs.get("wind_speed")

    if temp is not None and rh is not None:
        if obs.get("dewpoint") is None:
            obs["dewpoint"] = dew_point(temp, rh)
        if obs.get("heat_index") is None:
            obs["heat_index"] = heat_index(temp, rh)
        if obs.get("feels_like") is None:
            obs["feels_like"] = feels_like(temp, rh, wind)

    if temp is not None and wind is not None and obs.get("wind_chill") is None:
        obs["wind_chill"] = wind_chill(temp, wind)

    return obs

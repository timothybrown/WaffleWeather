"""Derived weather calculations computed on the fly, not stored in DB.

- Dew point: Magnus-Tetens formula (a=17.625, b=243.04)
- Heat index: Full NWS Rothfusz algorithm with adjustments
- Wind chill: NWS / Environment Canada formula
- Feels like: Composite (wind chill < 10°C, heat index > 27°C, actual otherwise)
- UTCI: Universal Thermal Climate Index (Bröde et al. 2012 polynomial)
- Zambretti: Barometric pressure forecast (Negretti & Zambra, 1915)
"""

import math
from typing import Any


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
    return round(float(wc), 1)


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


# ── Zambretti barometric forecast ────────────────────────────────────────────
#
# Implementation based on the pywws Zambretti algorithm by Jim Easterbrook,
# which is itself derived from Beteljuice's JavaScript implementation.
# Beteljuice owns an original 1915 Negretti & Zambra brass forecaster and
# reverse-engineered the algorithm, expanding wind direction from the original
# ~8 compass points to 16 for compatibility with modern weather stations.
#
# Reference chain:
#   Original device: E.W. Kitchin / Negretti & Zambra, Patent 6276/1915
#   Beteljuice:      beteljuice.co.uk/zambretti/forecast.html
#   Honeysucklecottage: honeysucklecottage.me.uk (JS -> Python port)
#   pywws:           github.com/jim-easterbrook/pywws (src/pywws/forecast.py)

# Forecast letter codes from the original Zambretti Forecaster (A-Z)
_ZAMBRETTI_FORECASTS = {
    "A": "Settled fine",
    "B": "Fine weather",
    "C": "Becoming fine",
    "D": "Fine, becoming less settled",
    "E": "Fine, possible showers",
    "F": "Fairly fine, improving",
    "G": "Fairly fine, possible showers early",
    "H": "Fairly fine, showery later",
    "I": "Showery early, improving",
    "J": "Changeable, mending",
    "K": "Fairly fine, showers likely",
    "L": "Rather unsettled clearing later",
    "M": "Unsettled, probably improving",
    "N": "Showery, bright intervals",
    "O": "Showery, becoming less settled",
    "P": "Changeable, some rain",
    "Q": "Unsettled, short fine intervals",
    "R": "Unsettled, rain later",
    "S": "Unsettled, some rain",
    "T": "Mostly very unsettled",
    "U": "Occasional rain, worsening",
    "V": "Rain at times, very unsettled",
    "W": "Rain at frequent intervals",
    "X": "Rain, very unsettled",
    "Y": "Stormy, may improve",
    "Z": "Stormy, much rain",
}

# Lookup tables mapping Z-index to forecast letter, per pressure trend
_ZAMBRETTI_RISING = ("A", "B", "B", "C", "F", "G", "I", "J", "L", "M", "M", "Q", "T", "Y")
_ZAMBRETTI_STEADY = ("A", "B", "B", "B", "E", "K", "N", "N", "P", "P", "S", "W", "W", "X", "X", "X", "Z")
_ZAMBRETTI_FALLING = ("B", "D", "H", "O", "R", "U", "V", "X", "X", "Z")

# 16-point wind direction adjustment (hPa), indexed 0=N through 15=NNW.
# Northerly winds add pressure (fair bias), southerly subtract (unsettled).
# Interpolated to 16 points by Beteljuice from the original ~8-point device.
_WIND_ADJ = (
    5.2, 4.2, 3.2, 1.05, -1.1, -3.15, -5.2, -8.35,
    -11.5, -9.4, -7.3, -5.25, -3.2, -1.15, 0.9, 3.05,
)


def zambretti_forecast(
    pressure_hpa: float,
    pressure_3h_ago_hpa: float | None,
    wind_dir: float | None = None,
    month: int | None = None,
    north: bool = True,
) -> str | None:
    """Zambretti barometric pressure forecast (Negretti & Zambra, 1915).

    Uses the current sea-level pressure, 3-hour pressure trend, optional
    wind direction, and month to produce a short-range weather forecast.

    Returns None if pressure_3h_ago is not available (need history).
    """
    if pressure_3h_ago_hpa is None:
        return None

    delta = pressure_hpa - pressure_3h_ago_hpa

    # Determine trend — threshold is 0.3 hPa over 3 hours (0.1 hPa/hour)
    if delta >= 0.3:
        trend = 1   # rising
    elif delta <= -0.3:
        trend = -1  # falling
    else:
        trend = 0   # steady

    # Start with current sea-level pressure
    p = pressure_hpa

    # Seasonal adjustment — summer biases rising toward fair, falling toward
    # unsettled. "S" and "W" on the original device = Summer / Winter.
    if month is not None:
        summer = north == (4 <= month <= 9)
        if summer:
            if trend > 0:
                p += 3.2
            elif trend < 0:
                p -= 3.2

    # 16-point wind direction adjustment (Northern Hemisphere convention,
    # rotated 180 degrees for Southern Hemisphere)
    if wind_dir is not None:
        wind_idx = round(wind_dir / 22.5) % 16
        if not north:
            wind_idx = (wind_idx + 8) % 16
        p += _WIND_ADJ[wind_idx]

    # Clamp to valid barometric range
    p = max(950.0, min(1050.0, p))

    # Compute Z-index using per-trend linear formulas and look up forecast
    if trend > 0:
        z = int(0.1740 * (1031.40 - p) + 0.5)
        z = max(0, min(z, len(_ZAMBRETTI_RISING) - 1))
        return _ZAMBRETTI_FORECASTS[_ZAMBRETTI_RISING[z]]
    elif trend < 0:
        z = int(0.1553 * (1029.95 - p) + 0.5)
        z = max(0, min(z, len(_ZAMBRETTI_FALLING) - 1))
        return _ZAMBRETTI_FORECASTS[_ZAMBRETTI_FALLING[z]]
    else:
        z = int(0.2314 * (1030.81 - p) + 0.5)
        z = max(0, min(z, len(_ZAMBRETTI_STEADY) - 1))
        return _ZAMBRETTI_FORECASTS[_ZAMBRETTI_STEADY[z]]


def _approximate_mrt(temp_c: float, solar_wm2: float) -> float:
    """Approximate Mean Radiant Temperature (°C) from solar radiation.

    Used as a fallback when no Black Globe Temperature sensor is available.
    """
    return temp_c + 1.5 * (solar_wm2 / 100.0)


def _mrt_from_bgt(globe_temp_c: float, temp_c: float, wind_ms: float) -> float:
    """Compute Mean Radiant Temperature (°C) from Black Globe Temperature.

    Uses the standard globe thermometer formula (ISO 7726):
        MRT = [(Tg+273)^4 + 1.1e8 * Va^0.6 * (Tg-Ta) / (D^0.4)]^0.25 - 273
    where Tg = globe temp, Va = wind speed (m/s), Ta = air temp,
    D = 0.15m (standard globe diameter).
    """
    Tg = globe_temp_c
    Ta = temp_c
    Va = max(wind_ms, 0.1)  # avoid zero
    D = 0.15  # standard globe diameter (m)
    return float(
        ((Tg + 273.0) ** 4 + 1.1e8 * Va**0.6 * (Tg - Ta) / D**0.4) ** 0.25
        - 273.0
    )


def utci(
    temp_c: float,
    rh_percent: float,
    wind_kmh: float,
    solar_wm2: float,
    globe_temp_c: float | None = None,
) -> float | None:
    """Universal Thermal Climate Index (°C) — Bröde et al. 2012 polynomial.

    Uses air temperature, humidity, wind speed, and Mean Radiant Temperature
    (MRT) to compute thermal stress. When a Black Globe Temperature sensor
    is available, MRT is computed precisely via ISO 7726; otherwise falls
    back to a linear approximation from solar radiation.

    Valid range: air temp -50..50°C, wind 0.5..17 m/s, MRT-Ta delta -30..70°C.
    Returns None if inputs are outside these bounds.
    """
    Ta = temp_c
    va = max(wind_kmh / 3.6, 0.5)  # km/h → m/s, clamp to minimum
    if va > 17.0:
        va = 17.0

    if globe_temp_c is not None:
        Tmrt = _mrt_from_bgt(globe_temp_c, Ta, va)
    else:
        Tmrt = _approximate_mrt(Ta, solar_wm2)
    D_Tmrt = Tmrt - Ta  # MRT - air temp offset

    if not (-50.0 <= Ta <= 50.0) or not (-30.0 <= D_Tmrt <= 70.0):
        return None

    # 6th-order polynomial regression (Bröde et al. 2012)
    # Using water vapour pressure (kPa) derived from RH and Magnus formula
    a, b = 17.625, 243.04
    es = 6.112 * math.exp((a * Ta) / (Ta + b))
    Pa = (rh_percent / 100.0) * es / 10.0  # hPa → kPa

    result = (
        Ta
        + 0.607562052 + -0.0227712343 * Ta + 8.06470249e-4 * Ta * Ta
        + -1.54271372e-4 * Ta * Ta * Ta + -3.24651735e-6 * Ta * Ta * Ta * Ta
        + 7.32602852e-8 * Ta * Ta * Ta * Ta * Ta
        + 1.35959073e-9 * Ta * Ta * Ta * Ta * Ta * Ta
        + -2.25836520 * va + 0.0880326035 * Ta * va
        + 0.00216844454 * Ta * Ta * va + -1.53347087e-5 * Ta * Ta * Ta * va
        + -5.72983704e-7 * Ta * Ta * Ta * Ta * va
        + -2.55090145e-9 * Ta * Ta * Ta * Ta * Ta * va
        + -0.751269505 * va * va + -0.00408350271 * Ta * va * va
        + -5.21670675e-5 * Ta * Ta * va * va
        + 1.94544667e-6 * Ta * Ta * Ta * va * va
        + 1.14099531e-8 * Ta * Ta * Ta * Ta * va * va
        + 0.158137256 * va * va * va + -6.57263143e-5 * Ta * va * va * va
        + 2.22697524e-7 * Ta * Ta * va * va * va
        + -4.16117031e-8 * Ta * Ta * Ta * va * va * va
        + -0.0127762753 * va * va * va * va
        + 9.66891875e-6 * Ta * va * va * va * va
        + 2.52785852e-9 * Ta * Ta * va * va * va * va
        + 4.56306672e-4 * va * va * va * va * va
        + -1.74202546e-7 * Ta * va * va * va * va * va
        + -5.91491269e-6 * va * va * va * va * va * va
        + 0.398374029 * D_Tmrt + 1.83945314e-4 * Ta * D_Tmrt
        + -1.73754510e-4 * Ta * Ta * D_Tmrt
        + -7.60781159e-7 * Ta * Ta * Ta * D_Tmrt
        + 3.77830287e-8 * Ta * Ta * Ta * Ta * D_Tmrt
        + 5.43079673e-10 * Ta * Ta * Ta * Ta * Ta * D_Tmrt
        + -0.0200518269 * va * D_Tmrt + 8.92859837e-4 * Ta * va * D_Tmrt
        + 3.45433048e-6 * Ta * Ta * va * D_Tmrt
        + -3.77925774e-7 * Ta * Ta * Ta * va * D_Tmrt
        + -1.69699377e-9 * Ta * Ta * Ta * Ta * va * D_Tmrt
        + 1.69992415e-4 * va * va * D_Tmrt
        + -4.99204314e-5 * Ta * va * va * D_Tmrt
        + 2.47417178e-7 * Ta * Ta * va * va * D_Tmrt
        + 1.07596466e-8 * Ta * Ta * Ta * va * va * D_Tmrt
        + 8.49242932e-5 * va * va * va * D_Tmrt
        + 1.35191328e-6 * Ta * va * va * va * D_Tmrt
        + -6.21531254e-9 * Ta * Ta * va * va * va * D_Tmrt
        + -4.99410301e-6 * va * va * va * va * D_Tmrt
        + -1.89489258e-8 * Ta * va * va * va * va * D_Tmrt
        + 8.15300114e-8 * va * va * va * va * va * D_Tmrt
        + 6.36471531e-10 * va * va * va * va * va * va * D_Tmrt
        + -2.14716971e-5 * D_Tmrt * D_Tmrt
        + 3.45062716e-4 * Ta * D_Tmrt * D_Tmrt
        + -8.99813200e-6 * Ta * Ta * D_Tmrt * D_Tmrt
        + -1.14681769e-8 * Ta * Ta * Ta * D_Tmrt * D_Tmrt
        + 1.27527767e-10 * Ta * Ta * Ta * Ta * D_Tmrt * D_Tmrt
        + 5.66850796e-4 * va * D_Tmrt * D_Tmrt
        + -5.21770879e-5 * Ta * va * D_Tmrt * D_Tmrt
        + 1.99215737e-7 * Ta * Ta * va * D_Tmrt * D_Tmrt
        + -2.18107553e-10 * Ta * Ta * Ta * va * D_Tmrt * D_Tmrt
        + -1.03548927e-4 * va * va * D_Tmrt * D_Tmrt
        + 1.55038128e-6 * Ta * va * va * D_Tmrt * D_Tmrt
        + 1.14299044e-8 * Ta * Ta * va * va * D_Tmrt * D_Tmrt
        + 2.50580797e-6 * va * va * va * D_Tmrt * D_Tmrt
        + -1.63279339e-7 * Ta * va * va * va * D_Tmrt * D_Tmrt
        + -2.97052166e-9 * va * va * va * va * D_Tmrt * D_Tmrt
        + 7.04260808e-7 * D_Tmrt * D_Tmrt * D_Tmrt
        + -2.23865990e-6 * Ta * D_Tmrt * D_Tmrt * D_Tmrt
        + 1.11727233e-7 * Ta * Ta * D_Tmrt * D_Tmrt * D_Tmrt
        + 1.03151905e-10 * Ta * Ta * Ta * D_Tmrt * D_Tmrt * D_Tmrt
        + 1.35005441e-6 * va * D_Tmrt * D_Tmrt * D_Tmrt
        + -6.93780420e-8 * Ta * va * D_Tmrt * D_Tmrt * D_Tmrt
        + -3.98178648e-10 * Ta * Ta * va * D_Tmrt * D_Tmrt * D_Tmrt
        + -1.18722148e-7 * va * va * D_Tmrt * D_Tmrt * D_Tmrt
        + 4.55477982e-9 * Ta * va * va * D_Tmrt * D_Tmrt * D_Tmrt
        + 1.72867550e-10 * va * va * va * D_Tmrt * D_Tmrt * D_Tmrt
        + -4.44577670e-8 * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + 5.92584395e-9 * Ta * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + -1.00085954e-10 * Ta * Ta * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + 8.67196153e-10 * va * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + -1.33979747e-10 * va * va * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + -3.00149419e-11 * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + 2.07250580e-11 * Ta * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + -2.24187101e-13 * va * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + 7.30891703e-13 * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt
        + 2.42085524e-3 * Pa + -4.38767396e-3 * Ta * Pa
        + 2.22566632e-5 * Ta * Ta * Pa + 4.39993950e-6 * Ta * Ta * Ta * Pa
        + -2.55106670e-8 * Ta * Ta * Ta * Ta * Pa
        + -6.32824288e-3 * va * Pa + 1.16254687e-4 * Ta * va * Pa
        + -2.30556393e-6 * Ta * Ta * va * Pa
        + 1.28897920e-7 * Ta * Ta * Ta * va * Pa
        + 4.52893177e-4 * va * va * Pa + -1.97090227e-5 * Ta * va * va * Pa
        + 6.36905553e-8 * Ta * Ta * va * va * Pa
        + -4.27502176e-5 * va * va * va * Pa
        + 1.24762588e-6 * Ta * va * va * va * Pa
        + 5.64259327e-7 * va * va * va * va * Pa
        + -7.72489348e-4 * D_Tmrt * Pa + 2.05040168e-4 * Ta * D_Tmrt * Pa
        + -6.94921542e-6 * Ta * Ta * D_Tmrt * Pa
        + 3.50103441e-8 * Ta * Ta * Ta * D_Tmrt * Pa
        + -1.35011346e-4 * va * D_Tmrt * Pa
        + 3.66348144e-6 * Ta * va * D_Tmrt * Pa
        + 3.40669699e-8 * Ta * Ta * va * D_Tmrt * Pa
        + 1.31746950e-5 * va * va * D_Tmrt * Pa
        + -3.11801860e-7 * Ta * va * va * D_Tmrt * Pa
        + -2.07884877e-7 * va * va * va * D_Tmrt * Pa
        + -5.23898038e-6 * D_Tmrt * D_Tmrt * Pa
        + 5.35740668e-7 * Ta * D_Tmrt * D_Tmrt * Pa
        + -5.72025756e-9 * Ta * Ta * D_Tmrt * D_Tmrt * Pa
        + 3.18149218e-6 * va * D_Tmrt * D_Tmrt * Pa
        + -9.31315769e-8 * Ta * va * D_Tmrt * D_Tmrt * Pa
        + 3.53764614e-8 * va * va * D_Tmrt * D_Tmrt * Pa
        + 8.78554818e-8 * D_Tmrt * D_Tmrt * D_Tmrt * Pa
        + -1.13998620e-8 * Ta * D_Tmrt * D_Tmrt * D_Tmrt * Pa
        + -1.70973573e-9 * va * D_Tmrt * D_Tmrt * D_Tmrt * Pa
        + 1.45117168e-10 * D_Tmrt * D_Tmrt * D_Tmrt * D_Tmrt * Pa
        + 1.24451902e-3 * Pa * Pa + 5.72153685e-5 * Ta * Pa * Pa
        + -2.63262256e-5 * Ta * Ta * Pa * Pa
        + -8.60568484e-8 * Ta * Ta * Ta * Pa * Pa
        + 4.68250903e-4 * va * Pa * Pa + -2.56745877e-5 * Ta * va * Pa * Pa
        + 7.42591451e-7 * Ta * Ta * va * Pa * Pa
        + -3.29782100e-5 * va * va * Pa * Pa
        + 5.63967882e-7 * Ta * va * va * Pa * Pa
        + -2.34461556e-7 * va * va * va * Pa * Pa
        + 6.23952586e-5 * D_Tmrt * Pa * Pa
        + -2.76820138e-6 * Ta * D_Tmrt * Pa * Pa
        + -8.37554455e-8 * Ta * Ta * D_Tmrt * Pa * Pa
        + -1.35469694e-5 * va * D_Tmrt * Pa * Pa
        + 5.30372914e-7 * Ta * va * D_Tmrt * Pa * Pa
        + 1.89882563e-8 * va * va * D_Tmrt * Pa * Pa
        + -1.30315237e-7 * D_Tmrt * D_Tmrt * Pa * Pa
        + 2.46256657e-8 * Ta * D_Tmrt * D_Tmrt * Pa * Pa
        + 1.53569379e-9 * va * D_Tmrt * D_Tmrt * Pa * Pa
        + -1.68135438e-10 * D_Tmrt * D_Tmrt * D_Tmrt * Pa * Pa
        + -1.27575037e-4 * Pa * Pa * Pa + -5.63855688e-6 * Ta * Pa * Pa * Pa
        + 3.70618498e-7 * Ta * Ta * Pa * Pa * Pa
        + 1.44373466e-5 * va * Pa * Pa * Pa
        + -5.31977690e-7 * Ta * va * Pa * Pa * Pa
        + -4.23972399e-7 * va * va * Pa * Pa * Pa
        + -7.47001923e-6 * D_Tmrt * Pa * Pa * Pa
        + 7.31285703e-7 * Ta * D_Tmrt * Pa * Pa * Pa
        + 2.49238547e-8 * va * D_Tmrt * Pa * Pa * Pa
        + 1.61489905e-8 * D_Tmrt * D_Tmrt * Pa * Pa * Pa
        + 3.15262888e-6 * Pa * Pa * Pa * Pa
        + -1.62644525e-7 * Ta * Pa * Pa * Pa * Pa
        + 3.71127970e-8 * va * Pa * Pa * Pa * Pa
        + 1.37833782e-8 * D_Tmrt * Pa * Pa * Pa * Pa
        + -5.44725157e-7 * Pa * Pa * Pa * Pa * Pa
        + -2.74592244e-8 * Ta * Pa * Pa * Pa * Pa * Pa
        + 2.40175241e-8 * va * Pa * Pa * Pa * Pa * Pa
        + 4.45073498e-8 * D_Tmrt * Pa * Pa * Pa * Pa * Pa
        + -2.29763424e-9 * Pa * Pa * Pa * Pa * Pa * Pa
    )

    return round(result, 1)


def enrich_observation(obs: dict[str, Any]) -> dict[str, Any]:
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

    solar = obs.get("solar_radiation")
    if (
        temp is not None
        and rh is not None
        and wind is not None
        and solar is not None
        and obs.get("utci") is None
    ):
        obs["utci"] = utci(temp, rh, wind, solar, globe_temp_c=obs.get("bgt"))

    return obs

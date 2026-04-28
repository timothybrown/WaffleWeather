"""Parse ecowitt2mqtt MQTT payloads into WeatherObservation data."""

import json
import logging
import math
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, cast

logger = logging.getLogger(__name__)

# Mapping from ecowitt2mqtt JSON keys to our database column names.
# ecowitt2mqtt may use different keys depending on firmware/config,
# so we map multiple possible keys to each column.
FIELD_MAP: dict[str, str] = {
    # Temperature
    "temp": "temp_outdoor",
    "tempf": "temp_outdoor",
    "temperature": "temp_outdoor",
    "temp1": "temp_outdoor",
    "tempin": "temp_indoor",
    "tempinf": "temp_indoor",
    "dewpoint": "dewpoint",
    "feelslike": "feels_like",
    "heatindex": "heat_index",
    "windchill": "wind_chill",
    "frostpoint": "frost_point",
    # Humidity
    "humidity": "humidity_outdoor",
    "humidity1": "humidity_outdoor",
    "humidityin": "humidity_indoor",
    # Pressure
    "baromabs": "pressure_abs",
    "baromabsin": "pressure_abs",
    "baromrel": "pressure_rel",
    "baromrelin": "pressure_rel",
    # Wind
    "windspeed": "wind_speed",
    "windspeedmph": "wind_speed",
    "windgust": "wind_gust",
    "windgustmph": "wind_gust",
    "winddir": "wind_dir",
    # Rain
    "rainrate": "rain_rate",
    "rainratein": "rain_rate",
    "rrain_piezo": "rain_rate",
    "dailyrain": "rain_daily",
    "dailyrainin": "rain_daily",
    "drain_piezo": "rain_daily",
    "weeklyrain": "rain_weekly",
    "weeklyrainin": "rain_weekly",
    "wrain_piezo": "rain_weekly",
    "monthlyrain": "rain_monthly",
    "monthlyrainin": "rain_monthly",
    "mrain_piezo": "rain_monthly",
    "yearlyrain": "rain_yearly",
    "yearlyrainin": "rain_yearly",
    "yrain_piezo": "rain_yearly",
    "eventrain": "rain_event",
    "eventrainin": "rain_event",
    "erain_piezo": "rain_event",
    # Solar / UV
    "solarradiation": "solar_radiation",
    "uv": "uv_index",
    # Thermal — Black Globe
    "bgt": "bgt",
    "wbgt": "wbgt",
    "vpd": "vpd",
    # Air quality
    "pm25": "pm25",
    "pm25_ch1": "pm25",
    "pm10": "pm10",
    "co2": "co2",
    "co2_in": "co2",
    # Soil
    "soilmoisture1": "soil_moisture_1",
    "soilmoisture2": "soil_moisture_2",
    # Lightning
    "lightning_num": "lightning_count",
    "lightning": "lightning_distance",
    "lightning_time": "lightning_time",
}

# Fields that should be parsed as integers
INTEGER_FIELDS = {"lightning_count"}

# Fields that should be parsed as datetime
DATETIME_FIELDS = {"lightning_time"}

# Fields that arrive in Fahrenheit and need conversion to Celsius
# (GW3000B passes BGT/WBGT in °F regardless of gateway unit setting)
FAHRENHEIT_FIELDS = {"bgt", "wbgt"}

INHG_TO_HPA = 33.8638866667
MPH_TO_KMH = 1.609344
INCH_TO_MM = 25.4


def _fahrenheit_to_celsius(value: float) -> float:
    return round((value - 32.0) * 5.0 / 9.0, 1)


def _round2(value: float) -> float:
    return round(value, 2)


# ecowitt2mqtt can publish either metric or imperial-keyed variants depending
# on gateway config. Database storage is metric-normalized.
IMPERIAL_KEY_CONVERTERS: dict[str, Callable[[float], float]] = {
    "tempf": _fahrenheit_to_celsius,
    "baromabsin": lambda value: _round2(value * INHG_TO_HPA),
    "baromrelin": lambda value: _round2(value * INHG_TO_HPA),
    "windspeedmph": lambda value: _round2(value * MPH_TO_KMH),
    "windgustmph": lambda value: _round2(value * MPH_TO_KMH),
    "rainratein": lambda value: _round2(value * INCH_TO_MM),
    "dailyrainin": lambda value: _round2(value * INCH_TO_MM),
    "weeklyrainin": lambda value: _round2(value * INCH_TO_MM),
    "monthlyrainin": lambda value: _round2(value * INCH_TO_MM),
    "yearlyrainin": lambda value: _round2(value * INCH_TO_MM),
    "eventrainin": lambda value: _round2(value * INCH_TO_MM),
}

# Battery fields: ecowitt key -> (label, type)
# Types: "boolean" (OFF=OK, ON=Low), "voltage" (V), "percentage" (%)
BATTERY_MAP: dict[str, tuple[str, str]] = {
    "wh25batt": ("Indoor T/H/Baro Sensor", "boolean"),  # WH25
    "wh26batt": ("T/H Sensor", "boolean"),  # WH32 / WH26
    "wh65batt": ("Outdoor Sensor Array", "boolean"),  # WH65 / WS69
    "wh68batt": ("Solar Anemometer", "voltage"),  # WS68
    "wh40batt": ("Rain Gauge", "voltage"),  # WH40
    "wh80batt": ("Ultrasonic Anemometer", "voltage"),  # WS80
    "wh90batt": ("7-in-1 Sensor Array", "voltage"),  # WS90
    "wh57batt": ("Lightning Detector", "percentage"),  # WH57
    "bgtbatt": ("Black Globe Thermometer", "boolean"),  # WN38 / BGT
    "co2_batt": ("CO2 Sensor", "percentage"),  # WH45
    **{f"batt{i}": (f"T/H Sensor Ch{i}", "boolean") for i in range(1, 9)},  # WH31
    **{f"soilbatt{i}": (f"Soil Moisture Sensor Ch{i}", "voltage") for i in range(1, 9)},  # WH51
    **{f"pm25batt{i}": (f"PM2.5 Air Quality Sensor Ch{i}", "percentage") for i in range(1, 5)},  # WH41/WH43
    **{f"leakbatt{i}": (f"Leak Sensor Ch{i}", "percentage") for i in range(1, 5)},  # WH55
}

# Gateway diagnostic fields to pass through
GATEWAY_FIELDS = {"runtime", "heap", "interval"}


# Physical-plausibility bounds per normalized (DB column) field name.
# Values outside these are treated as bad-sensor-readings and dropped with a log.
# Units: hPa (pressure), °C (temperature), % (humidity), km/h (wind),
# mm (rain), W/m² (solar). Imperial-keyed payload variants are converted
# before these bounds are applied.
_BOUNDS: dict[str, tuple[float, float]] = {
    "pressure_abs": (800.0, 1100.0),
    "pressure_rel": (800.0, 1100.0),
    "temp_outdoor": (-60.0, 60.0),
    "temp_indoor": (-40.0, 60.0),
    "dewpoint": (-80.0, 50.0),
    "feels_like": (-80.0, 70.0),
    "heat_index": (-80.0, 80.0),
    "wind_chill": (-80.0, 60.0),
    "frost_point": (-80.0, 50.0),
    "humidity_outdoor": (0.0, 100.0),
    "humidity_indoor": (0.0, 100.0),
    "wind_speed": (0.0, 150.0),
    "wind_gust": (0.0, 200.0),
    "wind_dir": (0.0, 360.0),
    "rain_rate": (0.0, 500.0),
    "rain_daily": (0.0, 1000.0),
    "rain_weekly": (0.0, 5000.0),
    "rain_monthly": (0.0, 20000.0),
    "rain_yearly": (0.0, 50000.0),
    "rain_event": (0.0, 5000.0),
    "uv_index": (0.0, 20.0),
    "solar_radiation": (0.0, 2000.0),
    "bgt": (-60.0, 90.0),
    "wbgt": (-60.0, 60.0),
    "vpd": (0.0, 80.0),
    "pm25": (0.0, 2000.0),
    "pm10": (0.0, 2000.0),
    "co2": (0.0, 10000.0),
    "soil_moisture_1": (0.0, 100.0),
    "soil_moisture_2": (0.0, 100.0),
    "lightning_distance": (0.0, 40.0),
    "lightning_count": (0.0, 1_000_000.0),
}


def _coerce_float(key: str, raw: object, device_id: str | None = None) -> float | None:
    """Convert raw to float with bounds check.

    Logs a warning and returns None for unparseable values or values outside
    the physical-plausibility bounds in _BOUNDS. Keys without a bounds entry
    are accepted without range checking.
    """
    try:
        value = float(cast(Any, raw))
    except (TypeError, ValueError):
        logger.warning(
            "Unparseable numeric value for %s: %r (device=%s)", key, raw, device_id
        )
        return None
    if not math.isfinite(value):
        logger.warning(
            "Non-finite numeric value for %s: %r (device=%s)", key, raw, device_id
        )
        return None
    bounds = _BOUNDS.get(key)
    if bounds is not None:
        lo, hi = bounds
        if not (lo <= value <= hi):
            logger.warning(
                "Out-of-range value for %s: %s (bounds %s-%s, device=%s)",
                key,
                value,
                lo,
                hi,
                device_id,
            )
            return None
    return value


def parse_ecowitt_payload(
    device_id: str, payload: str | bytes
) -> tuple[dict[str, object], dict[str, object]] | None:
    """Parse an ecowitt2mqtt JSON payload into observation + diagnostics.

    Args:
        device_id: The device identifier extracted from the MQTT topic.
        payload: The raw MQTT message payload (JSON string or bytes).

    Returns:
        A tuple of (observation_dict, diagnostics_dict), or None if parsing fails.
        The observation dict has keys matching WeatherObservation columns.
        The diagnostics dict has battery levels and gateway info (not stored in DB).
    """
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON payload from device %s: %s", device_id, payload[:200])
        return None

    if not isinstance(data, dict):
        logger.warning("Payload from device %s is not a JSON object", device_id)
        return None

    result: dict[str, object] = {
        "timestamp": datetime.now(timezone.utc),
        "station_id": device_id,
    }

    for ecowitt_key, db_column in FIELD_MAP.items():
        if ecowitt_key not in data:
            continue

        raw_value = data[ecowitt_key]

        # Skip None/empty values
        if raw_value is None or raw_value == "":
            continue

        # Don't overwrite if we already have a value for this column
        # (first match wins, so order in FIELD_MAP matters)
        if db_column in result:
            continue

        try:
            if db_column in DATETIME_FIELDS:
                # Lightning time may come as ISO string or unix timestamp
                if isinstance(raw_value, str) and ("T" in raw_value or "-" in raw_value):
                    result[db_column] = datetime.fromisoformat(raw_value)
                else:
                    result[db_column] = datetime.fromtimestamp(float(raw_value), tz=timezone.utc)
            elif db_column in INTEGER_FIELDS:
                # Parse via _coerce_float first to get bounds + safe conversion
                coerced = _coerce_float(db_column, raw_value, device_id)
                if coerced is not None:
                    result[db_column] = int(coerced)
            elif ecowitt_key in IMPERIAL_KEY_CONVERTERS:
                try:
                    converted = IMPERIAL_KEY_CONVERTERS[ecowitt_key](float(raw_value))
                except (TypeError, ValueError):
                    logger.warning(
                        "Unparseable imperial value for %s: %r (device=%s)",
                        ecowitt_key,
                        raw_value,
                        device_id,
                    )
                    continue
                coerced = _coerce_float(db_column, converted, device_id)
                if coerced is not None:
                    result[db_column] = coerced
            elif db_column in FAHRENHEIT_FIELDS:
                # Convert F->C then bounds-check in Celsius via _coerce_float.
                try:
                    celsius = round((float(raw_value) - 32.0) * 5.0 / 9.0, 2)
                except (TypeError, ValueError):
                    logger.warning(
                        "Unparseable Fahrenheit value for %s: %r (device=%s)",
                        ecowitt_key,
                        raw_value,
                        device_id,
                    )
                    continue
                coerced = _coerce_float(db_column, celsius, device_id)
                if coerced is not None:
                    result[db_column] = coerced
            else:
                coerced = _coerce_float(db_column, raw_value, device_id)
                if coerced is not None:
                    result[db_column] = coerced
        except (ValueError, TypeError) as e:
            logger.debug("Could not parse %s=%r for device %s: %s", ecowitt_key, raw_value, device_id, e)

    # Extract diagnostics (battery + gateway info) — not stored in DB
    diagnostics: dict[str, object] = {"batteries": {}, "gateway": {}}

    for ecowitt_key, (label, batt_type) in BATTERY_MAP.items():
        if ecowitt_key not in data or data[ecowitt_key] is None:
            continue
        raw = data[ecowitt_key]
        # Boolean batteries publish as strings ("OFF"/"ON"); keep as-is.
        # Numeric batteries (voltage/percentage) must parse safely.
        if isinstance(raw, str) and batt_type == "boolean":
            battery_value: str | float | None = raw
        else:
            try:
                parsed_val = float(raw)
                if not math.isfinite(parsed_val):
                    raise ValueError("non-finite")
                battery_value = parsed_val
            except (TypeError, ValueError):
                logger.warning(
                    "Unparseable battery value for %s: %r (device=%s)",
                    ecowitt_key,
                    raw,
                    device_id,
                )
                battery_value = None
        cast(dict[str, object], diagnostics["batteries"])[ecowitt_key] = {
            "label": label,
            "type": batt_type,
            "value": battery_value,
        }

    for key in GATEWAY_FIELDS:
        if key in data and data[key] is not None:
            try:
                gv = float(data[key])
                if not math.isfinite(gv):
                    raise ValueError("non-finite")
                cast(dict[str, object], diagnostics["gateway"])[key] = gv
            except (TypeError, ValueError):
                logger.warning(
                    "Unparseable gateway field %s: %r (device=%s)",
                    key,
                    data[key],
                    device_id,
                )

    return result, diagnostics

"""Parse ecowitt2mqtt MQTT payloads into WeatherObservation data."""

import json
import logging
from datetime import datetime, timezone

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

# Battery fields: ecowitt key -> (label, type)
# Types: "boolean" (OFF=OK, ON=Low), "voltage" (V), "percentage" (%)
BATTERY_MAP: dict[str, tuple[str, str]] = {
    "wh25batt": ("Indoor Sensor", "boolean"),
    "wh26batt": ("Indoor Sensor", "boolean"),
    "wh65batt": ("Weather Station", "boolean"),
    "wh68batt": ("Outdoor Sensor", "voltage"),
    "wh40batt": ("Rain Gauge", "voltage"),
    "wh80batt": ("Anemometer", "voltage"),
    "wh90batt": ("Weather Station", "voltage"),
    "wh57batt": ("Lightning Detector", "percentage"),
    "bgtbatt": ("Globe Thermometer", "boolean"),
    "co2_batt": ("CO2 Sensor", "percentage"),
    **{f"batt{i}": (f"Sensor Ch{i}", "boolean") for i in range(1, 9)},
    **{f"soilbatt{i}": (f"Soil Sensor Ch{i}", "voltage") for i in range(1, 9)},
    **{f"pm25batt{i}": (f"PM2.5 Sensor Ch{i}", "percentage") for i in range(1, 5)},
    **{f"leakbatt{i}": (f"Leak Sensor Ch{i}", "percentage") for i in range(1, 5)},
}

# Gateway diagnostic fields to pass through
GATEWAY_FIELDS = {"runtime", "heap", "interval"}


def parse_ecowitt_payload(
    device_id: str, payload: str | bytes
) -> tuple[dict, dict] | None:
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

    result: dict = {
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
                result[db_column] = int(float(raw_value))
            elif db_column in FAHRENHEIT_FIELDS:
                result[db_column] = round((float(raw_value) - 32.0) * 5.0 / 9.0, 2)
            else:
                result[db_column] = float(raw_value)
        except (ValueError, TypeError) as e:
            logger.debug("Could not parse %s=%r for device %s: %s", ecowitt_key, raw_value, device_id, e)

    # Extract diagnostics (battery + gateway info) — not stored in DB
    diagnostics: dict = {"batteries": {}, "gateway": {}}

    for ecowitt_key, (label, batt_type) in BATTERY_MAP.items():
        if ecowitt_key not in data or data[ecowitt_key] is None:
            continue
        raw = data[ecowitt_key]
        diagnostics["batteries"][ecowitt_key] = {
            "label": label,
            "type": batt_type,
            "value": raw if isinstance(raw, str) else float(raw),
        }

    for key in GATEWAY_FIELDS:
        if key in data and data[key] is not None:
            diagnostics["gateway"][key] = float(data[key])

    return result, diagnostics

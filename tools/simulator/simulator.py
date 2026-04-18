"""WaffleWeather weather data simulator.

Pulls real weather data from Open-Meteo and feeds it into the WaffleWeather
pipeline via MQTT (simulate mode) or direct DB insert (backfill mode).
"""

from __future__ import annotations

import json
import os
import random
import time as _time
from dataclasses import dataclass
from datetime import date, datetime, timezone

import click
import httpx
import paho.mqtt.client as mqtt
import psycopg2
from dotenv import dotenv_values
from psycopg2.extras import execute_values


@dataclass
class Config:
    lat: float
    lon: float
    altitude: float
    broker: str
    port: int
    username: str | None
    password: str | None
    topic: str
    db_url: str | None
    station_id: str
    interval: int


OPEN_METEO_FIELDS = [
    "temperature_2m",
    "relative_humidity_2m",
    "surface_pressure",
    "pressure_msl",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "rain",
    "shortwave_radiation",
    "uv_index",
    "dew_point_2m",
]

OPENMETEO_TO_MQTT: dict[str, str] = {
    "temperature_2m": "temp",
    "relative_humidity_2m": "humidity",
    "surface_pressure": "baromabs",
    "pressure_msl": "baromrel",
    "wind_speed_10m": "windspeed",
    "wind_gusts_10m": "windgust",
    "wind_direction_10m": "winddir",
    "rain": "rainrate",
    "shortwave_radiation": "solarradiation",
    "uv_index": "uv",
    "dew_point_2m": "dewpoint",
}

OPENMETEO_TO_DB: dict[str, str] = {
    "temperature_2m": "temp_outdoor",
    "relative_humidity_2m": "humidity_outdoor",
    "surface_pressure": "pressure_abs",
    "pressure_msl": "pressure_rel",
    "wind_speed_10m": "wind_speed",
    "wind_gusts_10m": "wind_gust",
    "wind_direction_10m": "wind_dir",
    "rain": "rain_rate",
    "shortwave_radiation": "solar_radiation",
    "uv_index": "uv_index",
    "dew_point_2m": "dewpoint",
}

BOUNDS: dict[str, tuple[float, float]] = {
    "temp": (-60.0, 60.0),
    "humidity": (0.0, 100.0),
    "baromabs": (800.0, 1100.0),
    "baromrel": (800.0, 1100.0),
    "windspeed": (0.0, 150.0),
    "windgust": (0.0, 200.0),
    "winddir": (0.0, 360.0),
    "rainrate": (0.0, 500.0),
    "solarradiation": (0.0, 2000.0),
    "uv": (0.0, 20.0),
    "dewpoint": (-80.0, 50.0),
}


def fetch_current(lat: float, lon: float) -> dict[str, float]:
    """Fetch current conditions from Open-Meteo. Returns MQTT-keyed dict."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join(OPEN_METEO_FIELDS),
        "wind_speed_unit": "ms",
    }
    resp = httpx.get(url, params=params, timeout=15)
    resp.raise_for_status()
    current = resp.json()["current"]
    result: dict[str, float] = {}
    for om_key, mqtt_key in OPENMETEO_TO_MQTT.items():
        val = current.get(om_key)
        if val is not None:
            result[mqtt_key] = float(val)
    return result


JITTER: dict[str, float] = {
    "temp": 0.05,
    "humidity": 0.3,
    "baromabs": 0.05,
    "baromrel": 0.05,
    "windspeed": 0.2,
    "windgust": 0.3,
    "winddir": 3.0,
    "solarradiation": 5.0,
    "uv": 0.1,
    "dewpoint": 0.05,
    "rainrate": 0.0,
}


def apply_jitter(truth: dict[str, float]) -> dict[str, float]:
    """Apply Gaussian jitter to a truth snapshot, clamping to physical bounds."""
    result: dict[str, float] = {}
    for key, value in truth.items():
        stddev = JITTER.get(key, 0.0)
        if key == "rainrate" and value <= 0:
            stddev = 0.0
        jittered = value + random.gauss(0, stddev) if stddev > 0 else value
        lo, hi = BOUNDS.get(key, (float("-inf"), float("inf")))
        if key == "winddir":
            jittered = jittered % 360
        else:
            jittered = max(lo, min(hi, jittered))
        result[key] = round(jittered, 2)
    return result


def publish_mqtt(cfg: Config, payload: dict[str, float | int], start_time: float) -> None:
    """Publish a single observation to MQTT."""
    payload["wh25batt"] = 0
    payload["runtime"] = int(_time.time() - start_time)
    payload["heap"] = 45000
    payload["interval"] = cfg.interval

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if cfg.username:
        client.username_pw_set(cfg.username, cfg.password)
    client.connect(cfg.broker, cfg.port)
    msg = json.dumps(payload)
    result = client.publish(cfg.topic, msg)
    result.wait_for_publish()
    client.disconnect()


def fetch_archive(lat: float, lon: float, start: date, end: date) -> list[dict[str, object]]:
    """Fetch hourly historical data from Open-Meteo Archive API.

    Returns a list of dicts keyed by DB column names.
    """
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(OPEN_METEO_FIELDS),
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }
    resp = httpx.get(url, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()["hourly"]

    timestamps = data["time"]
    rows: list[dict[str, object]] = []
    for i, ts_str in enumerate(timestamps):
        row: dict[str, object] = {
            "timestamp": datetime.fromisoformat(ts_str).replace(tzinfo=timezone.utc),
        }
        for om_key, db_col in OPENMETEO_TO_DB.items():
            val = data.get(om_key, [None] * len(timestamps))[i]
            if val is not None:
                row[db_col] = float(val)
        rows.append(row)
    return rows


DB_COLUMNS = [
    "timestamp", "station_id", "temp_outdoor", "humidity_outdoor",
    "pressure_abs", "pressure_rel", "wind_speed", "wind_gust", "wind_dir",
    "rain_rate", "solar_radiation", "uv_index", "dewpoint",
]


def insert_rows(db_url: str, rows: list[dict[str, object]], station_id: str) -> int:
    """Batch-insert observation rows into weather_observations. Returns count inserted."""
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(sync_url)
    try:
        cur = conn.cursor()
        values = []
        for row in rows:
            row["station_id"] = station_id
            values.append(tuple(row.get(col) for col in DB_COLUMNS))

        sql = f"""
            INSERT INTO weather_observations ({', '.join(DB_COLUMNS)})
            VALUES %s
            ON CONFLICT (timestamp, station_id) DO NOTHING
        """
        execute_values(cur, sql, values, page_size=500)
        inserted = cur.rowcount
        conn.commit()
        return inserted
    finally:
        conn.close()


CONTINUOUS_AGGREGATES = [
    "observations_hourly",
    "observations_daily",
    "observations_monthly",
]


def refresh_aggregates(db_url: str, start: date, end: date) -> None:
    """Refresh TimescaleDB continuous aggregates for the given date range."""
    from dateutil.relativedelta import relativedelta

    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = psycopg2.connect(sync_url)
    conn.autocommit = True
    try:
        cur = conn.cursor()
        start_ts = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
        end_ts = datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc)
        for agg in CONTINUOUS_AGGREGATES:
            # Monthly aggregate needs window covering at least two full buckets
            agg_end = end_ts + relativedelta(months=2) if "monthly" in agg else end_ts
            click.echo(f"  Refreshing {agg}...")
            cur.execute(
                f"CALL refresh_continuous_aggregate('{agg}', %s::timestamptz, %s::timestamptz)",
                (start_ts, agg_end),
            )
    finally:
        conn.close()


def _resolve(cli_val: object, env: dict[str, str | None], env_key: str, default: object) -> object:
    """Resolve a config value: CLI arg > .env file > shell env > default."""
    if cli_val is not None:
        return cli_val
    if env.get(env_key) is not None:
        return env[env_key]
    if os.environ.get(env_key) is not None:
        return os.environ[env_key]
    return default


def load_config(
    env_file: str | None,
    *,
    lat: float | None,
    lon: float | None,
    altitude: float | None,
    broker: str | None,
    port: int | None,
    username: str | None,
    password: str | None,
    topic: str | None,
    db_url: str | None,
    station_id: str | None,
    interval: int | None,
) -> Config:
    env = dotenv_values(env_file) if env_file else {}

    resolved_lat = _resolve(lat, env, "WW_STATION_LATITUDE", None)
    resolved_lon = _resolve(lon, env, "WW_STATION_LONGITUDE", None)
    if resolved_lat is None or resolved_lon is None:
        raise click.UsageError("--lat and --lon are required (or set WW_STATION_LATITUDE / WW_STATION_LONGITUDE)")

    return Config(
        lat=float(resolved_lat),
        lon=float(resolved_lon),
        altitude=float(_resolve(altitude, env, "WW_STATION_ALTITUDE", 0)),
        broker=str(_resolve(broker, env, "WW_MQTT_BROKER", "localhost")),
        port=int(_resolve(port, env, "WW_MQTT_PORT", 1883)),  # type: ignore[arg-type]
        username=_resolve(username, env, "WW_MQTT_USERNAME", None),  # type: ignore[arg-type]
        password=_resolve(password, env, "WW_MQTT_PASSWORD", None),  # type: ignore[arg-type]
        topic=str(_resolve(topic, env, "WW_MQTT_TOPIC", "ecowitt2mqtt/simulator")),
        db_url=_resolve(db_url, env, "WW_DATABASE_URL", None),  # type: ignore[arg-type]
        station_id=str(_resolve(station_id, env, "WW_STATION_NAME", "simulator")),
        interval=int(_resolve(interval, env, "WW_INTERVAL", 60)),  # type: ignore[arg-type]
    )


_shared_options = [
    click.option("--env-file", type=click.Path(exists=True), default=None, help="Path to .env file"),
    click.option("--lat", type=float, default=None, help="Station latitude"),
    click.option("--lon", type=float, default=None, help="Station longitude"),
    click.option("--altitude", type=float, default=None, help="Station altitude (meters)"),
]


def shared_options(fn):  # noqa: ANN001, ANN201
    for opt in reversed(_shared_options):
        fn = opt(fn)
    return fn


@click.group()
def cli() -> None:
    """WaffleWeather weather data simulator."""


@cli.command()
@shared_options
@click.option("--broker", default=None, help="MQTT broker hostname")
@click.option("--port", type=int, default=None, help="MQTT broker port")
@click.option("--username", default=None, help="MQTT username")
@click.option("--password", default=None, help="MQTT password")
@click.option("--topic", default=None, help="MQTT topic (default: ecowitt2mqtt/simulator)")
@click.option("--interval", type=int, default=None, help="Publish interval in seconds (default: 60)")
@click.option("--station-id", default=None, help="Station ID for MQTT topic (default: simulator)")
def simulate(env_file, lat, lon, altitude, broker, port, username, password, topic, interval, station_id, **_) -> None:  # noqa: ANN001
    """Publish realtime weather data to MQTT."""
    cfg = load_config(
        env_file, lat=lat, lon=lon, altitude=altitude, broker=broker, port=port,
        username=username, password=password, topic=topic, db_url=None,
        station_id=station_id, interval=interval,
    )
    click.echo(f"Simulator: ({cfg.lat}, {cfg.lon}) → mqtt://{cfg.broker}:{cfg.port}/{cfg.topic}")
    click.echo(f"Interval: {cfg.interval}s | Open-Meteo poll: 15m")
    click.echo("Press Ctrl+C to stop.\n")

    poll_interval = 15 * 60  # 15 minutes
    start_time = _time.time()
    truth: dict[str, float] = {}
    last_poll: float = 0

    try:
        while True:
            now = _time.time()
            if now - last_poll >= poll_interval or not truth:
                try:
                    truth = fetch_current(cfg.lat, cfg.lon)
                    last_poll = now
                    ts = _time.strftime("%H:%M:%S")
                    click.echo(f"[{ts}] Open-Meteo poll: temp={truth.get('temp', '?')}°C wind={truth.get('windspeed', '?')}m/s")
                except httpx.HTTPError as exc:
                    ts = _time.strftime("%H:%M:%S")
                    click.echo(f"[{ts}] Open-Meteo fetch failed: {exc}", err=True)
                    if not truth:
                        click.echo("No cached data — retrying in 30s", err=True)
                        _time.sleep(30)
                        continue

            payload = apply_jitter(truth)
            publish_mqtt(cfg, payload, start_time)

            ts = _time.strftime("%H:%M:%S")
            fields = " ".join(f"{k}={v}" for k, v in sorted(payload.items()) if k not in ("wh25batt", "runtime", "heap", "interval"))
            click.echo(f"[{ts}] Published: {fields}")

            remaining = poll_interval - (_time.time() - last_poll)
            mins, secs = divmod(int(remaining), 60)
            click.echo(f"         Next poll in {mins}m{secs:02d}s")

            _time.sleep(cfg.interval)

    except KeyboardInterrupt:
        click.echo("\nStopped.")


@cli.command()
@shared_options
@click.option("--db-url", default=None, help="PostgreSQL connection URL")
@click.option("--start", required=True, type=click.DateTime(formats=["%Y-%m-%d"]), help="Backfill start date")
@click.option("--end", required=True, type=click.DateTime(formats=["%Y-%m-%d"]), help="Backfill end date")
@click.option("--station-id", default=None, help="Station ID for DB rows (default: simulator)")
def backfill(env_file, lat, lon, altitude, db_url, start, end, station_id, **_) -> None:  # noqa: ANN001
    """Backfill historical weather data into the database."""
    cfg = load_config(
        env_file, lat=lat, lon=lon, altitude=altitude, broker="unused", port=None,
        username=None, password=None, topic=None, db_url=db_url,
        station_id=station_id, interval=None,
    )
    if not cfg.db_url:
        raise click.UsageError("--db-url is required for backfill (or set WW_DATABASE_URL)")

    start_date = start.date()
    end_date = end.date()
    click.echo(f"Fetching {start_date} to {end_date} for ({cfg.lat}, {cfg.lon})...")

    t0 = _time.time()
    rows = fetch_archive(cfg.lat, cfg.lon, start_date, end_date)
    click.echo(f"  Got {len(rows)} hourly observations from Open-Meteo")

    click.echo(f"Inserting into weather_observations (station_id={cfg.station_id})...")
    inserted = insert_rows(cfg.db_url, rows, cfg.station_id)
    click.echo(f"  {inserted} rows inserted ({len(rows) - inserted} skipped as duplicates)")

    click.echo("Refreshing continuous aggregates...")
    refresh_aggregates(cfg.db_url, start_date, end_date)

    elapsed = _time.time() - t0
    click.echo(f"\nDone: {inserted} rows in {elapsed:.1f}s")


if __name__ == "__main__":
    cli()

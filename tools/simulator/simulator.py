"""WaffleWeather weather data simulator.

Pulls real weather data from Open-Meteo and feeds it into the WaffleWeather
pipeline via MQTT (simulate mode) or direct DB insert (backfill mode).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import click
from dotenv import dotenv_values


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
    click.echo(f"Simulating for ({cfg.lat}, {cfg.lon}) → {cfg.broker}:{cfg.port}/{cfg.topic}")
    click.echo(f"Interval: {cfg.interval}s")


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
    click.echo(f"Backfill for ({cfg.lat}, {cfg.lon}), station_id={cfg.station_id}")
    click.echo(f"Range: {start.date()} to {end.date()}")


if __name__ == "__main__":
    cli()

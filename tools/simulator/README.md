# WaffleWeather Simulator

Dev tool that pulls real weather data from [Open-Meteo](https://open-meteo.com/)
and feeds it into WaffleWeather. No weather station required.

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd tools/simulator
```

No install step needed — `uv run` handles dependency resolution automatically.

## Usage

### Realtime Mode

Publishes live weather data to MQTT with sensor-like jitter:

```bash
# Using Docker .env for connection details
uv run simulator simulate --env-file ../../docker/.env --lat 40.7128 --lon -74.006

# All explicit
uv run simulator simulate \
  --broker localhost --port 1883 \
  --username waffleweather --password changeme \
  --lat 40.7128 --lon -74.006 --interval 30
```

Polls Open-Meteo every 15 minutes for truth data, then publishes jittered
observations at `--interval` (default: 60s).

### Backfill Mode

Fetches historical hourly data and inserts directly into TimescaleDB:

```bash
uv run simulator backfill \
  --env-file ../../docker/.env \
  --db-url "postgresql://waffleweather:yourpassword@localhost:5432/waffleweather" \
  --lat 40.7128 --lon -74.006 \
  --start 2026-03-18 --end 2026-04-18
```

Note: For Docker, TimescaleDB port 5432 must be exposed to the host, or run
the backfill from inside the Docker network.

## Configuration

Options are resolved in priority order: CLI args > .env file > shell env vars > defaults.

| Env var | CLI flag | Default |
|---|---|---|
| `WW_MQTT_BROKER` | `--broker` | `localhost` |
| `WW_MQTT_PORT` | `--port` | `1883` |
| `WW_MQTT_USERNAME` | `--username` | — |
| `WW_MQTT_PASSWORD` | `--password` | — |
| `WW_MQTT_TOPIC` | `--topic` | `ecowitt2mqtt/simulator` |
| `WW_DATABASE_URL` | `--db-url` | — (required for backfill) |
| `WW_STATION_LATITUDE` | `--lat` | — (required) |
| `WW_STATION_LONGITUDE` | `--lon` | — (required) |
| `WW_STATION_ALTITUDE` | `--altitude` | `0` |

## Data Source

[Open-Meteo](https://open-meteo.com/) — free, no API key, CC BY 4.0 license.
Current conditions updated every ~15 minutes; archive data available hourly
back to 1940.

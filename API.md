# API Reference

WaffleWeather exposes a REST API and a WebSocket endpoint. All REST endpoints live under `/api/v1`. The canonical OpenAPI spec is at `openapi/waffleweather.yaml` — set `WW_ENABLE_DOCS=true` to get interactive Swagger UI at `/docs`.

## Authentication

When `WW_API_KEY` is set, all requests must include an `X-API-Key` header. When unset, auth is disabled (suitable for LAN-only use). The deploy setup script generates a key automatically and injects it via Nginx.

## Data Flow Overview

```
Weather Station → ecowitt2mqtt → Mosquitto (MQTT)
                                       ↓
                                  FastAPI Backend
                                 ↙      ↓       ↘
                          WebSocket   REST API   TimescaleDB
                          (live obs)  (queries)  (persistence)
```

1. The weather station gateway pushes readings to ecowitt2mqtt (which supports Ecowitt, Ambient Weather, and other Fine Offset-based brands), which publishes normalized JSON to MQTT.
2. The backend's MQTT listener parses each message, stores it in `weather_observations`, detects lightning deltas (→ `lightning_events`), computes derived values, and broadcasts the enriched observation to all WebSocket clients.
3. REST endpoints query the database for historical, aggregated, and current data.
4. The frontend merges REST and WebSocket data: REST provides the baseline (including fields like `zambretti_forecast` that require DB lookback), and WebSocket overlays real-time updates.

## Database Tables and Views

| Name | Type | Description |
|------|------|-------------|
| `weather_observations` | Hypertable | Raw observations, one row per MQTT message (~16s interval). Chunked by day, compressed after 14 days, retained for 1 year. |
| `lightning_events` | Hypertable | Detected strike events with delta counts and distance. Created when the MQTT listener detects a change in `lightning_count` or `lightning_time`. |
| `stations` | Table | Station metadata (id, name, model, firmware, location). Upserted on first observation. |
| `observations_hourly` | Continuous aggregate | Hourly rollups from raw data. Refreshes every hour. |
| `observations_daily` | Continuous aggregate | Daily rollups from hourly. Refreshes daily. |
| `observations_monthly` | Continuous aggregate | Monthly rollups from daily. Refreshes daily. |

**Aggregated columns** (all three views share the same schema):

`temp_outdoor_avg`, `temp_outdoor_min`, `temp_outdoor_max`, `dewpoint_avg`, `dewpoint_min`, `dewpoint_max`, `humidity_outdoor_avg`, `humidity_outdoor_min`, `humidity_outdoor_max`, `pressure_rel_avg`, `wind_speed_avg`, `wind_gust_max`, `rain_daily_max`, `solar_radiation_avg`, `uv_index_max`

## REST Endpoints

### Stations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/stations` | List all registered stations |
| GET | `/api/v1/stations/{station_id}` | Get a single station's metadata |

**Source:** `stations` table. Station records are created/updated automatically when the first MQTT observation arrives.

### Observations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/observations/latest` | Most recent observation (optionally filtered by `station_id`) |
| GET | `/api/v1/observations` | Paginated raw observations with `start`, `end`, `limit`, `offset` filters |

**Source:** `weather_observations` hypertable.

The `latest` endpoint also computes the Zambretti barometric forecast on-the-fly by looking up pressure from 3 hours ago.

**Response fields** (40+ weather metrics): `temp_outdoor`, `temp_indoor`, `dewpoint`, `feels_like`, `heat_index`, `wind_chill`, `frost_point`, `humidity_outdoor`, `humidity_indoor`, `pressure_abs`, `pressure_rel`, `wind_speed`, `wind_gust`, `wind_dir`, `rain_rate`, `rain_daily`, `rain_weekly`, `rain_monthly`, `rain_yearly`, `rain_event`, `solar_radiation`, `uv_index`, `pm25`, `pm10`, `co2`, `soil_moisture_1`, `soil_moisture_2`, `lightning_count`, `lightning_distance`, `lightning_time`, `utci`, `zambretti_forecast`

Derived fields (`dewpoint`, `feels_like`, `heat_index`, `wind_chill`, `utci`) are computed at query time from raw inputs, never stored.

### Aggregates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/observations/hourly` | Hourly aggregated observations (`start`, `end` required) |
| GET | `/api/v1/observations/daily` | Daily aggregated observations |
| GET | `/api/v1/observations/monthly` | Monthly aggregated observations |

**Source:** `observations_hourly`, `observations_daily`, `observations_monthly` continuous aggregate views respectively.

### Calendar Heatmap

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/observations/calendar` | Daily metric values for a given year |

**Parameters:** `metric` (required), `year` (optional, defaults to current year), `station_id` (optional)

**Allowed metrics:** `temp_outdoor_max`, `rain_daily_max`, `solar_radiation_avg`, `wind_gust_max`, `humidity_outdoor_avg`, `lightning_strikes`

**Source:** `observations_daily` view for weather metrics, `lightning_events` table for `lightning_strikes`.

### Wind Rose

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/observations/wind-rose` | Wind direction/speed distribution binned into 16 compass sectors and 5 speed bands |

**Parameters:** `start`, `end` (required), `station_id` (optional)

**Speed bands (km/h):** 0-5, 5-15, 15-25, 25-40, 40+

**Source:** Raw `weather_observations` (wind_dir + wind_speed columns).

### Climate Reports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/reports/monthly` | Monthly climate report with daily rows |
| GET | `/api/v1/reports/yearly` | Yearly climate report with monthly rows |
| GET | `/api/v1/reports/monthly/txt` | Monthly report as NOAA-format plain text |
| GET | `/api/v1/reports/yearly/txt` | Yearly report as NOAA-format plain text |

**Parameters (monthly):** `year` (required), `month` (required), `station_id` (optional)

**Parameters (yearly):** `year` (required), `station_id` (optional)

**TXT endpoints** accept an additional `units` parameter (`metric` or `imperial`, default `metric`). Returns `Content-Type: text/plain` with a `Content-Disposition` header for file download.

**Source:** `observations_daily` continuous aggregate for temperature, dewpoint, humidity, pressure, wind speed/gust, and rain. Raw `weather_observations` for prevailing wind direction (16-point compass mode). Heating/cooling degree days computed from daily average temperature with base 18.3°C (65°F).

### Lightning

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/observations/lightning/events` | Paginated list of detected lightning events |
| GET | `/api/v1/observations/lightning/summary` | Aggregated strike statistics with hourly and daily breakdowns |

**Source:** `lightning_events` table.

Both endpoints accept an `include_filtered` query parameter (default `false`). When false, events flagged as likely false positives (ghost strikes) are excluded from results and aggregations.

The summary endpoint returns: `total_strikes`, `event_count`, `filtered_count`, `closest_distance`, plus `hourly[]` (strikes per hour, min distance) and `daily[]` (strikes per day) breakdowns.

**Ghost strike filtering:** The WH57 sensor (AS3935) is prone to EMI-triggered false positives — isolated single-strike events at fixed distances. When `WW_LIGHTNING_FILTER_ENABLED=true`, the MQTT listener flags events matching the configured distance blocklist (`WW_LIGHTNING_FILTER_DISTANCES`) with `filtered=true`. Events with `new_strikes` exceeding `WW_LIGHTNING_FILTER_MAX_STRIKES` (default 1) bypass the filter, since real storms produce multi-strike bursts. The filter is disabled by default; configure it in `.env` with distances specific to your environment.

## WebSocket

**Endpoint:** `ws://<host>/ws/live`

The WebSocket broadcasts every observation as it arrives from MQTT. There is no request/subscribe protocol — connect and you receive all updates.

### Message Format

```json
{
  "type": "observation",
  "timestamp": "2026-04-09T15:30:00Z",
  "station_id": "GW3000B",
  "temp_outdoor": 12.6,
  "humidity_outdoor": 45,
  "wind_speed": 3.2,
  "...all observation fields...",
  "zambretti_forecast": "Fine, becoming less settled",
  "diagnostics": {
    "batteries": {
      "wh65batt": { "label": "Outdoor Sensor Array", "type": "boolean", "value": "OK" }
    },
    "gateway": {
      "runtime": 123456,
      "heap": 65536,
      "interval": 30
    }
  }
}
```

### Key Differences from REST

- **Diagnostics** (battery levels, gateway metrics) are broadcast via WebSocket only and are never stored in the database.
- **Zambretti forecast** is computed in the MQTT listener using an in-memory 4-hour pressure deque. The REST `/latest` endpoint computes it separately via a DB lookback query.

### Frontend Merge Strategy

Pages that use both REST and WebSocket (Observatory, Console, Lightning) merge them as:

```typescript
const data = wsData ? { ...apiData, ...wsData } : apiData;
```

WebSocket fields overwrite REST fields for real-time feel, but REST-only fields (like `zambretti_forecast` from the DB lookback) persist from the initial fetch until overwritten by a WS message that includes them.

## Frontend Page Data Sources

| Page | REST Endpoints | WebSocket | Update Pattern |
|------|---------------|-----------|----------------|
| **Observatory** | `latest`, `observations` (trends), `hourly` (today extremes) | Live observation | REST baseline + WS live updates; trends refresh every 60s |
| **Console** | `latest`, `stations`, `hourly` (barometer chart) | Live observation | WS for live obs; hourly chart refetches every 60s |
| **Lightning** | `latest`, `stations`, `lightning/summary`, `lightning/events` | Live observation | WS for live strike count; REST on time range change |
| **History** | `observations` (24h) or `hourly`/`daily`/`monthly` (7d/30d/1y) | Not used | One-shot fetch per time range selection |
| **Wind Rose** | `wind-rose` | Not used | One-shot fetch per time range selection |
| **Settings** | `stations` | Diagnostics only | Station info once; diagnostics update on each WS message |
| **Reports** | `reports/monthly`, `reports/yearly` | Not used | One-shot fetch per period selection |

## Resolution Selection

The History page auto-selects data granularity based on time range:

| Range | Endpoint | Resolution | Typical Row Count |
|-------|----------|------------|-------------------|
| 24 hours | `/observations` (raw) | ~16 seconds | ~5,000 |
| 7 days | `/observations/hourly` | 1 hour | ~168 |
| 30 days | `/observations/daily` | 1 day | ~30 |
| 1 year | `/observations/monthly` | 1 month | ~12 |

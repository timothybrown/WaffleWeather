# Docker Installation

Run WaffleWeather using Docker Compose. This is the recommended method for
homelab deployments (Unraid, Proxmox, Synology, etc.) and local development.

For native Raspberry Pi installation, see the [setup guide](deploy/setup.sh).

## Prerequisites

- Docker Engine 24+
- Docker Compose v2
- An Ecowitt-compatible weather station (GW1000/GW1100/GW2000/GW3000 series)

## Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/timb-machine-dreams/WaffleWeather.git
   cd WaffleWeather
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and set at minimum:
   - `WW_DB_PASSWORD` — a strong database password
   - `WW_MQTT_PASSWORD` — MQTT broker password
   - `WW_STATION_NAME` — your station's display name
   - `WW_STATION_LATITUDE` / `WW_STATION_LONGITUDE` / `WW_STATION_ALTITUDE`

4. Start all services:

   ```bash
   cd docker
   docker compose up -d
   ```

5. Configure your Ecowitt gateway to send data to your Docker host's IP on
   port 8080 (Customized > Weather Services > Customized upload).

6. Open `http://<your-host>` in a browser.

## Environment Variables

See [`.env.example`](.env.example) for all available variables with descriptions.

Docker Compose overrides `WW_DATABASE_URL` and `WW_MQTT_BROKER` automatically
so you only need to set `WW_DB_PASSWORD` (not the full database URL).

## Upgrading

```bash
cd docker
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup.

## Using an Existing MQTT Broker

If you already run Mosquitto (e.g., for Home Assistant), you can point
WaffleWeather at your existing broker:

1. Set `WW_MQTT_BROKER`, `WW_MQTT_PORT`, `WW_MQTT_USERNAME`, and
   `WW_MQTT_PASSWORD` in `.env` to your existing broker's details.

2. In `docker/docker-compose.yml`, comment out or remove the `mosquitto`
   service and remove `mosquitto` from the `depends_on` entries for
   `ecowitt2mqtt` and `backend`.

## Viewing Logs

```bash
cd docker
docker compose logs -f              # all services
docker compose logs -f backend      # single service
```

## Database Backup

```bash
docker compose exec timescaledb pg_dump -U waffleweather waffleweather > backup.sql
```

To restore:

```bash
docker compose exec -T timescaledb psql -U waffleweather waffleweather < backup.sql
```

## Development

Build from source with hot reload:

```bash
cd docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

- Backend: source changes auto-reload via uvicorn `--reload`
- Frontend: runs `next dev` with source volume mounts

## Architecture

```
Ecowitt Gateway → ecowitt2mqtt (:8080) → Mosquitto → Backend (:8000) → TimescaleDB
                                                                ↕
                                          Nginx (:80) → Frontend (:3000)
```

All services communicate over an internal Docker network. Only ports 80 (web)
and 8080 (weather station data) are exposed to the host.

## PostgreSQL Major Version Upgrades

TimescaleDB is pinned to PostgreSQL 17. Major version upgrades (e.g., PG17 →
PG18) require a manual migration. When a release changes the PG major version,
it will be called out in the release notes with instructions.

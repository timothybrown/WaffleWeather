# Development Guide

## Prerequisites

- **Python 3.12+** with [uv](https://docs.astral.sh/uv/) for backend dependency management
- **Node.js 20+** with [pnpm](https://pnpm.io/) for frontend dependency management
- **PostgreSQL 15+** with [TimescaleDB](https://www.timescale.com/) extension
- **Mosquitto** (or any MQTT broker) for receiving weather station data
- **Docker** (optional) — can be used to run PostgreSQL/TimescaleDB and Mosquitto locally

## Project Structure

```
WaffleWeather/
├── backend/          # FastAPI + SQLAlchemy + MQTT listener
│   ├── app/          # Application code
│   │   ├── api/      # REST endpoint routers
│   │   ├── models/   # SQLAlchemy ORM models
│   │   ├── mqtt/     # MQTT client + message parser
│   │   ├── schemas/  # Pydantic schemas
│   │   └── services/ # Business logic (derived calcs, broadcasting)
│   ├── alembic/      # Database migrations
│   └── tests/        # pytest test suite
├── frontend/         # Next.js 16 + React 19 + uPlot + TanStack Query
│   └── src/
│       ├── app/          # Next.js pages
│       ├── components/   # UI components (dashboard cards, layout, etc.)
│       ├── generated/    # Auto-generated API client (orval)
│       ├── hooks/        # Custom React hooks
│       ├── lib/          # Utilities, unit conversion, fetch wrapper
│       ├── providers/    # React context providers (units, websocket, query)
│       └── test/         # Test infrastructure (fixtures, wrappers, setup)
├── openapi/          # OpenAPI 3.1 spec (source of truth for API contract)
├── deploy/           # systemd services, nginx, mosquitto configs
└── scripts/          # Deploy script, seed data, MQTT test publisher
```

## Environment Variables

The backend reads all config from environment variables prefixed with `WW_`. Create a `.env` file in the project root (or `backend/` — both are checked):

```bash
# Required
WW_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/waffleweather

# MQTT (defaults shown)
WW_MQTT_BROKER=localhost
WW_MQTT_PORT=1883
WW_MQTT_TOPIC=ecowitt2mqtt/#
WW_MQTT_USERNAME=
WW_MQTT_PASSWORD=

# Optional
WW_CORS_ORIGINS=["http://localhost:3000"]
WW_ENABLE_DOCS=true          # Exposes /docs and /openapi.json
WW_API_KEY=                   # Set to require X-API-Key header on all endpoints

# Station metadata (used by Sun/Moon cards)
WW_STATION_NAME=My Weather Station
WW_STATION_LATITUDE=40.7128
WW_STATION_LONGITUDE=-74.0060
WW_STATION_ALTITUDE=10.0

# Lightning false-positive filter (disabled by default)
WW_LIGHTNING_FILTER_ENABLED=true          # Enable ghost strike filtering
WW_LIGHTNING_FILTER_DISTANCES=[12.0,14.0] # Distance blocklist in km (JSON array)
WW_LIGHTNING_FILTER_MAX_STRIKES=1         # Only filter events with this many strikes or fewer
```

The frontend uses two optional env vars:
```bash
NEXT_PUBLIC_API_URL=          # Defaults to '' (same-origin)
NEXT_PUBLIC_WS_URL=           # Defaults to ws:// or wss:// based on page protocol
```

## Backend Setup

```bash
cd backend

# Install dependencies (including dev extras)
uv sync --extra dev

# Run database migrations
uv run alembic upgrade head

# Start the dev server (auto-reload)
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend starts an MQTT listener in the background that receives weather data from ecowitt2mqtt and stores it in TimescaleDB. Observations are broadcast to connected WebSocket clients in real time.

### API Documentation

Set `WW_ENABLE_DOCS=true` in your `.env`, then visit http://localhost:8000/docs for the interactive Swagger UI.

The canonical OpenAPI spec lives at `openapi/waffleweather.yaml` and is loaded by the backend at startup.

## Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Generate API client from OpenAPI spec
pnpm generate

# Start the dev server
pnpm dev
```

The dev server runs at http://localhost:3000 and proxies API requests to the backend.

### API Client Generation

The frontend uses [Orval](https://orval.dev/) to generate a type-safe API client with React Query hooks from the OpenAPI spec. After any API changes:

```bash
pnpm generate    # Regenerates src/generated/ from openapi/waffleweather.yaml
```

The generated code lives in `src/generated/` and should not be edited by hand.

## Linting

```bash
# Backend (ruff)
cd backend && uv run ruff check .

# Frontend (eslint)
cd frontend && pnpm lint
```

## Testing

### Backend Tests

The backend uses **pytest** with **pytest-asyncio** for async test support. Tests mock the database (no real PostgreSQL needed) and run fast.

```bash
cd backend

# Run all tests
uv run pytest

# Run with coverage report
uv run pytest --cov=app --cov-report=term-missing

# Run a specific test file
uv run pytest tests/test_derived.py

# Run tests matching a pattern
uv run pytest -k "zambretti"
```

**Coverage target:** 80%+ (currently ~89%)

**Test structure:**
| File | What it tests |
|------|--------------|
| `test_derived.py` | Pure math: dew point, heat index, wind chill, feels like, zambretti, UTCI |
| `test_parser.py` | MQTT payload parsing, field mapping, edge cases |
| `test_schemas.py` | Pydantic schema validation, derived field computation |
| `test_broadcast.py` | WebSocket connection manager, JSON serialization |
| `test_config.py` | Settings loading from env vars |
| `test_api_observations.py` | `/api/v1/observations` endpoints |
| `test_api_stations.py` | `/api/v1/stations` endpoints |
| `test_api_aggregates.py` | Hourly/daily/monthly aggregates, calendar, wind rose |
| `test_api_lightning.py` | Lightning events and summary endpoints |
| `test_mqtt_client.py` | Message handling, lightning detection, pressure history |
| `test_main.py` | App startup, routes, middleware |
| `test_openapi_contract.py` | Schemathesis property-based tests against OpenAPI spec |

### Frontend Tests

The frontend uses **Vitest** with **happy-dom** and **Testing Library**. Components are rendered with a test wrapper that provides React Query and Units context.

```bash
cd frontend

# Run all tests
pnpm test

# Run in watch mode (re-runs on file changes)
pnpm test:watch

# Run with coverage report
pnpm test:coverage

# Run a specific test file
pnpm test -- src/lib/utils.test.ts
```

**Coverage target:** 80%+ (currently ~92%, pages excluded)

**Test conventions:**
- Test files are colocated next to the code they test (`Component.test.tsx`)
- Use `renderWithProviders()` from `src/test/wrappers.tsx` to render with all required context
- Use `makeObservation()` from `src/test/fixtures.ts` to build test data
- Mock generated API hooks with `vi.mock("@/generated/...")`
- Mock external deps (SunCalc, react-leaflet) at the module level

## Database Migrations

Migrations use Alembic with async SQLAlchemy. TimescaleDB hypertables and continuous aggregates are managed through migrations. All continuous aggregate views have real-time aggregation enabled (`materialized_only = false`), so the current incomplete bucket is always visible in query results.

```bash
cd backend

# Create a new migration after model changes
uv run alembic revision --autogenerate -m "Description of change"

# Apply all pending migrations
uv run alembic upgrade head

# Rollback one migration
uv run alembic downgrade -1
```

## Deployment

The project deploys to a Raspberry Pi 4 via rsync:

```bash
./scripts/deploy.sh
```

This script syncs files, installs dependencies, builds the frontend, runs migrations, and restarts systemd services. See `deploy/` for service and nginx configuration files.

## Tailscale HTTPS

The PWA service worker requires a secure context (HTTPS or localhost). If you access WaffleWeather over [Tailscale](https://tailscale.com/), you can get free TLS certificates for your Pi's `.ts.net` domain:

```bash
# On the Pi: generate the certificate
sudo tailscale cert your-hostname.your-tailnet.ts.net

# Move certs to nginx
sudo mkdir -p /etc/nginx/ssl
sudo mv your-hostname.your-tailnet.ts.net.crt /etc/nginx/ssl/
sudo mv your-hostname.your-tailnet.ts.net.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/*.key
```

Then add an HTTPS server block to `/etc/nginx/sites-available/waffleweather` alongside the existing HTTP block:

```nginx
server {
    listen 443 ssl;
    server_name your-hostname.your-tailnet.ts.net;

    ssl_certificate /etc/nginx/ssl/your-hostname.your-tailnet.ts.net.crt;
    ssl_certificate_key /etc/nginx/ssl/your-hostname.your-tailnet.ts.net.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ... same location blocks as the HTTP server ...
}
```

Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`

Tailscale certs expire after 90 days. Renew with:
```bash
sudo tailscale cert \
  --cert-file /etc/nginx/ssl/your-hostname.your-tailnet.ts.net.crt \
  --key-file /etc/nginx/ssl/your-hostname.your-tailnet.ts.net.key \
  your-hostname.your-tailnet.ts.net \
  && sudo systemctl reload nginx
```

Note: `scripts/deploy.sh` does not touch the nginx config — manual changes persist across deploys.

## Useful Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy.sh` | Deploy to Raspberry Pi |
| `scripts/seed-data.py` | Seed the database with sample observations |
| `scripts/mqtt-test-publish.py` | Publish a test MQTT message for local development |

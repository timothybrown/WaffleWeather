# Development Guide

Everything you need to develop, test, and contribute to WaffleWeather.

## Dev Environment (Docker)

Build from source with hot reload:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d
```

- Backend: source changes auto-reload via uvicorn `--reload`
- Frontend: runs `next dev` with source volume mounts
- **Auto-seeding**: On first start, the `seed` service backfills 3 years of
  OKC weather data (2021–2023) from Open-Meteo. Subsequent starts skip seeding
  if data already exists.
- **Realtime simulator**: After seeding, the `simulator` service publishes
  live weather data to MQTT every 60 seconds, keeping the dashboard updating.

### Seed Data

The dev environment seeds Oklahoma City (35.47°N, 97.52°W) data from
2021-01-01 to 2023-12-31 (~26k hourly observations). This location was chosen
for extreme weather variability: Winter Storm Uri (Feb 2021), summer heat domes
(110°F+), and severe storms.

To reset the seed data, tear down with volumes and restart:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml down -v
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d
```

## Simulated Weather Data

No weather station? The dev overlay auto-seeds and runs the simulator for you.
For manual control, use the simulator CLI directly:

```bash
cd tools/simulator
uv run simulator simulate --env-file ../../docker/.env --lat 40.7128 --lon -74.006
```

See [`tools/simulator/README.md`](tools/simulator/README.md) for backfill mode
and configuration options.

## E2E Testing

Run the full end-to-end API test suite against a Docker stack seeded with
3 years of weather data.

We recommend running Docker in a separate clone to keep build artifacts out of
your working tree:

```bash
# One-time setup
git clone /path/to/WaffleWeather ~/Development/WaffleWeatherTests

# Set parse-time vars for base compose (not real secrets — ephemeral test DB)
export WW_DB_PASSWORD=testpassword WW_MQTT_PASSWORD=testpassword

# Run E2E tests
cd ~/Development/WaffleWeatherTests
git pull origin main
docker compose -f docker/docker-compose.yml -f docker/docker-compose.test.yml up \
  --build --abort-on-container-exit --exit-code-from test-runner

# Clean up
docker compose -f docker/docker-compose.yml -f docker/docker-compose.test.yml down -v
```

The test stack spins up TimescaleDB (tmpfs for speed), Mosquitto, and the
backend, runs migrations, seeds 3 years of OKC data, then runs the pytest
E2E suite.

### Test Categories

- **Schema validation**: Every endpoint returns 200 and matches the OpenAPI spec
- **Golden value assertions**: Key aggregation endpoints (daily, monthly,
  reports, records, calendar, wind rose) are compared against known-good
  fixture files using partial matching (new fields don't break tests)

### Regenerating Fixtures

If you intentionally change response shapes or fix a calculation bug,
regenerate the golden value fixtures:

```bash
# 1. Start backend services (migrations run inline, seed via test-runner)
cd ~/Development/WaffleWeatherTests
export WW_DB_PASSWORD=testpassword WW_MQTT_PASSWORD=testpassword
docker compose -f docker/docker-compose.yml -f docker/docker-compose.test.yml up --build -d \
  timescaledb mosquitto backend
# Wait for backend to be healthy
docker compose -f docker/docker-compose.yml -f docker/docker-compose.test.yml run --rm \
  --entrypoint "sh -c" test-runner "cd /app/simulator && sh /app/seed.sh"

# 2. Generate fixtures
cd ~/Development/WaffleWeather/tools/fixtures
uv run generate-fixtures generate --url http://localhost:18000

# 3. Tear down
cd ~/Development/WaffleWeatherTests
docker compose -f docker/docker-compose.yml -f docker/docker-compose.test.yml down -v
```

Commit the updated fixture files in `tests/e2e/fixtures/`.

## CI/CD Pipeline

The release workflow (`release.yml`) gates on four checks before publishing
Docker images:

1. **Backend CI** — Ruff lint, Mypy type check, pytest
2. **Frontend CI** — TypeScript check, Vitest tests, Next.js build
3. **Version Check** — Backend and frontend versions match
4. **E2E Tests** — Full API test suite against a seeded Docker stack

All four must pass on the tagged commit before images are built and pushed
to GHCR.

## Tailscale TLS

If you access WaffleWeather over [Tailscale](https://tailscale.com/), you can
enable HTTPS with automatic certificates for your `.ts.net` domain:

```bash
sudo tailscale cert --cert-file /etc/ssl/tailscale.crt --key-file /etc/ssl/tailscale.key your-host.your-tailnet.ts.net
```

Then uncomment Block 2 in `deploy/nginx.conf` and update the `server_name`
and certificate paths. Certificates auto-renew every 90 days.

HTTPS is required for the PWA service worker and install prompts to function.

## Unit Tests

**Backend:**

```bash
cd backend
uv run pytest --tb=short -q
```

**Frontend:**

```bash
cd frontend
pnpm test
```

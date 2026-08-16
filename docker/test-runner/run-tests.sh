#!/bin/sh
set -e

# Seed the database (idempotent — skips if data exists).
# Runs here instead of a separate container so that this is the only
# one-shot process in the stack, allowing --abort-on-container-exit to
# tear down cleanly when tests finish.
cd /app/simulator
sh /app/seed.sh

# Backfill gateway sensors and materialize aggregates after seeded raw observations are present.
cd /app/backend
uv run python -m app.maintenance.backfill_sensor_observations
uv run python -m app.maintenance.refresh_aggregates --family all

# Run E2E tests
cd /app/tests/e2e
uv run pytest . -v --tb=short

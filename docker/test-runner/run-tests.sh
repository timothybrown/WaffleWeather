#!/bin/sh
set -e

# Seed the database (idempotent — skips if data exists).
# Runs here instead of a separate container so that this is the only
# one-shot process in the stack, allowing --abort-on-container-exit to
# tear down cleanly when tests finish.
cd /app/simulator
sh /app/seed.sh

# Run E2E tests
cd /app/tests/e2e
uv run pytest . -v --tb=short

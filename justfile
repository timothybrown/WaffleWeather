# WaffleWeather developer commands

set dotenv-load := false

compose := "docker compose -f docker/docker-compose.yml"

# Run the E2E test stack (schema + golden value validation)
e2e:
    touch docker/.env
    WW_DB_PASSWORD=testpassword WW_MQTT_PASSWORD=testpassword {{ compose }} -f docker/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner

# Start the dev stack with seed data and live simulator (requires docker/.env)
dev:
    {{ compose }} -f docker/docker-compose.dev.yml up --build

# Stop and remove all dev/test containers
down:
    touch docker/.env
    WW_DB_PASSWORD=x WW_MQTT_PASSWORD=x {{ compose }} -f docker/docker-compose.dev.yml down -v 2>/dev/null; true
    WW_DB_PASSWORD=x WW_MQTT_PASSWORD=x {{ compose }} -f docker/docker-compose.test.yml down -v 2>/dev/null; true

# Regenerate E2E golden fixtures (test stack must be running on :18000)
generate-fixtures:
    cd tools/fixtures && uv run generate-fixtures generate --url http://localhost:18000

# Run backend unit tests
test-backend *args:
    cd backend && uv run --extra dev pytest {{ args }}

# Run frontend unit tests
test-frontend *args:
    cd frontend && pnpm vitest run {{ args }}

# Run all local tests (backend + frontend)
test: test-backend test-frontend

# Type-check backend
typecheck-backend:
    cd backend && uv run --extra dev mypy app/

# Type-check frontend
typecheck-frontend:
    cd frontend && pnpm tsc --noEmit

# Lint backend
lint-backend:
    cd backend && uv run --extra dev ruff check .

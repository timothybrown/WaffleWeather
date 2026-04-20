# WaffleWeather developer commands

set dotenv-load := false

compose := "docker compose -f docker/docker-compose.yml"

# Run the E2E test stack (schema + golden value validation)
e2e:
    {{ compose }} -f docker/docker-compose.test.yml up --build --abort-on-container-exit

# Start the dev stack with seed data and live simulator
dev:
    {{ compose }} -f docker/docker-compose.dev.yml up --build

# Stop and remove all dev/test containers
down:
    {{ compose }} -f docker/docker-compose.dev.yml -f docker/docker-compose.test.yml down -v

# Regenerate E2E golden fixtures (test stack must be running)
generate-fixtures:
    cd tools/fixtures && uv run generate_fixtures.py generate --url http://localhost:18000

# Run backend unit tests
test-backend *args:
    cd backend && uv run pytest {{ args }}

# Run frontend unit tests
test-frontend *args:
    cd frontend && pnpm vitest run {{ args }}

# Run all local tests (backend + frontend)
test: test-backend test-frontend

# Type-check backend
typecheck-backend:
    cd backend && uv run mypy app/

# Type-check frontend
typecheck-frontend:
    cd frontend && pnpm tsc --noEmit

# Lint backend
lint-backend:
    cd backend && uv run ruff check .

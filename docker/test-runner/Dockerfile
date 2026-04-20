FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

# Install simulator (for seeding)
COPY tools/simulator/pyproject.toml tools/simulator/uv.lock* /app/simulator/
RUN cd /app/simulator && (uv sync --frozen --no-dev --no-install-project 2>/dev/null || uv sync --no-dev --no-install-project)
COPY tools/simulator/ /app/simulator/
RUN cd /app/simulator && uv sync --no-dev && uv pip install --no-deps -e .

# Install E2E test deps
COPY tests/e2e/pyproject.toml /app/tests/e2e/
RUN cd /app/tests/e2e && (uv sync --frozen --no-dev --no-install-project 2>/dev/null || uv sync --no-dev --no-install-project)
COPY tests/e2e/ /app/tests/e2e/
COPY openapi/ /app/openapi/

COPY docker/test-runner/run-tests.sh /app/run-tests.sh
COPY docker/simulator/seed.sh /app/seed.sh

# Single entrypoint: seed, then test. This container is the only one-shot
# process in the stack, so --abort-on-container-exit tears down cleanly
# when it finishes.
CMD ["sh", "/app/run-tests.sh"]

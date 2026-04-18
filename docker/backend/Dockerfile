FROM python:3.12-slim AS base

RUN pip install uv

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ .

RUN uv sync --frozen --no-dev && uv pip install --no-deps -e .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--limit-concurrency", "100", "--limit-max-requests", "10000"]

FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

COPY tools/simulator/pyproject.toml tools/simulator/uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project 2>/dev/null || uv sync --no-dev --no-install-project

COPY tools/simulator/ .

RUN uv sync --no-dev && uv pip install --no-deps -e .

ENTRYPOINT ["uv", "run", "simulator"]

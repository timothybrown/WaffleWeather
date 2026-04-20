"""Shared fixtures for E2E tests."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx
import pytest
import yaml
from collections.abc import Generator


BASE_URL = os.environ.get("BASE_URL", "http://backend:8000")
FIXTURES_DIR = Path(__file__).parent / "fixtures"
OPENAPI_PATH = Path(__file__).parent.parent.parent / "openapi" / "waffleweather.yaml"


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def client(base_url: str) -> Generator[httpx.Client, None, None]:
    client = httpx.Client(base_url=base_url, timeout=30)
    _wait_for_backend(client)
    yield client
    client.close()


def _wait_for_backend(client: httpx.Client, retries: int = 30, delay: float = 2.0) -> None:
    for i in range(retries):
        try:
            resp = client.get("/api/v1/version")
            if resp.status_code == 200:
                return
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        if i < retries - 1:
            time.sleep(delay)
    raise RuntimeError(f"Backend not ready after {retries * delay}s")


@pytest.fixture(scope="session")
def openapi_spec() -> dict:
    with open(OPENAPI_PATH) as f:
        return yaml.safe_load(f)


def load_fixture(filename: str) -> dict | list:
    path = FIXTURES_DIR / filename
    with open(path) as f:
        return json.load(f)

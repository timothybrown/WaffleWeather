"""Shared test fixtures for WaffleWeather backend tests."""

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

# Set required env var BEFORE any app imports (database.py reads Settings() at module level)
os.environ.setdefault("WW_DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")


@pytest.fixture
def mock_db_session():
    """Mock AsyncSession with configurable execute() returns."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    return session


@pytest.fixture
def test_client(mock_db_session):
    """httpx AsyncClient configured with mocked DB dependency."""
    import httpx
    from httpx import ASGITransport

    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield mock_db_session

    app.dependency_overrides[get_db] = override_get_db

    client = httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_observation_dict():
    """Realistic observation data matching WeatherObservation columns."""
    return {
        "timestamp": datetime(2026, 4, 5, 12, 0, 0, tzinfo=timezone.utc),
        "station_id": "test-station",
        "temp_outdoor": 22.5,
        "temp_indoor": 21.0,
        "humidity_outdoor": 65.0,
        "humidity_indoor": 45.0,
        "pressure_abs": 1010.0,
        "pressure_rel": 1013.25,
        "wind_speed": 12.0,
        "wind_gust": 18.5,
        "wind_dir": 225.0,
        "rain_rate": 0.0,
        "rain_daily": 2.5,
        "rain_weekly": 15.0,
        "rain_monthly": 45.0,
        "rain_yearly": 320.0,
        "rain_event": 2.5,
        "solar_radiation": 450.0,
        "uv_index": 5.2,
        "lightning_count": 3,
        "lightning_distance": 14.0,
        "lightning_time": datetime(2026, 4, 5, 11, 45, 0, tzinfo=timezone.utc),
    }


@pytest.fixture
def sample_ecowitt_payload():
    """JSON bytes mimicking a real ecowitt2mqtt MQTT message."""
    import json
    return json.dumps({
        "temp": 22.5,
        "humidity": 65.0,
        "tempinf": 21.0,
        "humidityin": 45.0,
        "baromabs": 1010.0,
        "baromrel": 1013.25,
        "windspeed": 12.0,
        "windgust": 18.5,
        "winddir": 225.0,
        "rainrate": 0.0,
        "dailyrain": 2.5,
        "weeklyrain": 15.0,
        "monthlyrain": 45.0,
        "yearlyrain": 320.0,
        "eventrain": 2.5,
        "solarradiation": 450.0,
        "uv": 5.2,
        "lightning_num": 3,
        "lightning": 14.0,
        "lightning_time": "2026-04-05T11:45:00+00:00",
        "wh25batt": 0,
        "wh80batt": 3.2,
        "wh57batt": 85,
        "runtime": 12345,
        "heap": 45000,
        "interval": 16,
    }).encode("utf-8")


@pytest.fixture
def sample_station():
    """Mock Station object."""
    station = MagicMock()
    station.id = "test-station"
    station.name = "Test Weather Station"
    station.model = "GW3000B"
    station.firmware_version = "3.1.5"
    station.last_seen = datetime(2026, 4, 5, 12, 0, 0, tzinfo=timezone.utc)
    station.latitude = 40.7128
    station.longitude = -74.006
    station.altitude = 10.0
    return station


@pytest.fixture(autouse=True)
def reset_mqtt_globals():
    """Reset MQTT client global state between tests."""
    from app.mqtt.client import _last_lightning, _pressure_history

    _pressure_history.clear()
    _last_lightning.clear()
    yield
    _pressure_history.clear()
    _last_lightning.clear()

"""Tests for app/api/aggregates.py endpoints."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest


def _make_agg_row(**overrides):
    """Build a dict that looks like a DB mapping row for aggregate views."""
    base = {
        "station_id": "s1",
        "bucket": datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        "temp_outdoor_avg": 22.0,
        "temp_outdoor_min": 18.0,
        "temp_outdoor_max": 26.0,
        "humidity_outdoor_avg": 55.0,
        "humidity_outdoor_min": 42.0,
        "humidity_outdoor_max": 68.0,
        "pressure_rel_avg": 1013.0,
        "wind_speed_avg": 10.0,
        "wind_gust_max": 18.0,
        "rain_daily_max": 2.5,
        "solar_radiation_avg": 300.0,
        "uv_index_max": 5.0,
    }
    base.update(overrides)
    return base


class TestHourlyEndpoint:
    async def test_returns_data(self, test_client, mock_db_session):
        result = MagicMock()
        result.mappings.return_value.all.return_value = [_make_agg_row()]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/hourly",
            params={"start": "2026-04-05T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["temp_outdoor_avg"] == 22.0

    async def test_empty_result(self, test_client, mock_db_session):
        result = MagicMock()
        result.mappings.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/hourly",
            params={"start": "2026-04-05T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestDailyEndpoint:
    async def test_returns_data(self, test_client, mock_db_session):
        result = MagicMock()
        result.mappings.return_value.all.return_value = [_make_agg_row()]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/daily",
            params={"start": "2026-04-01T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestMonthlyEndpoint:
    async def test_returns_data(self, test_client, mock_db_session):
        result = MagicMock()
        result.mappings.return_value.all.return_value = [_make_agg_row()]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/monthly",
            params={"start": "2026-01-01T00:00:00Z", "end": "2026-12-31T23:59:59Z"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestCalendarEndpoint:
    async def test_valid_metric(self, test_client, mock_db_session):
        from datetime import date

        result = MagicMock()
        result.mappings.return_value.all.return_value = [
            {"date": date(2026, 4, 5), "value": 26.0},
            {"date": date(2026, 4, 6), "value": 24.0},
        ]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/calendar",
            params={"metric": "temp_outdoor_max", "year": 2026},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["value"] == 26.0

    async def test_invalid_metric(self, test_client, mock_db_session):
        resp = await test_client.get(
            "/api/v1/observations/calendar",
            params={"metric": "sql_injection_attempt"},
        )
        assert resp.status_code == 400

    async def test_invalid_year_rejected(self, test_client, mock_db_session):
        resp = await test_client.get(
            "/api/v1/observations/calendar",
            params={"metric": "temp_outdoor_max", "year": 0},
        )
        assert resp.status_code == 422

    async def test_lightning_strikes_metric(self, test_client, mock_db_session):
        from datetime import date

        result = MagicMock()
        result.mappings.return_value.all.return_value = [
            {"date": date(2026, 4, 5), "value": 15},
        ]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/calendar",
            params={"metric": "lightning_strikes", "year": 2026},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestWindRoseEndpoint:
    async def test_returns_binned_data(self, test_client, mock_db_session):
        # Simulate raw wind data rows (wind_dir, wind_speed)
        result = MagicMock()
        result.all.return_value = [
            (0.0, 3.0),    # N, 0-5 band
            (5.0, 4.0),    # N, 0-5 band
            (90.0, 10.0),  # E, 5-15 band
            (180.0, 30.0), # S, 25-40 band
            (270.0, 50.0), # W, 40+ band
        ]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/wind-rose",
            params={"start": "2026-04-05T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Should only include non-zero bins
        assert len(data) > 0
        assert all("direction" in d and "speed_range" in d and "count" in d for d in data)
        total_count = sum(d["count"] for d in data)
        assert total_count == 5

    async def test_empty_wind_data(self, test_client, mock_db_session):
        result = MagicMock()
        result.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get(
            "/api/v1/observations/wind-rose",
            params={"start": "2026-04-05T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        assert resp.json() == []

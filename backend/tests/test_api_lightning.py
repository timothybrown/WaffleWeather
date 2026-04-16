"""Tests for app/api/lightning.py endpoints."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock



def _make_lightning_event(**overrides):
    """Build a mock LightningEvent-like object."""
    evt = MagicMock()
    defaults = {
        "timestamp": datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        "station_id": "s1",
        "new_strikes": 5,
        "distance_km": 12.0,
        "cumulative_count": 50,
        "filtered": False,
    }
    defaults.update(overrides)
    for k, v in defaults.items():
        setattr(evt, k, v)
    return evt


class TestListLightningEvents:
    async def test_paginated(self, test_client, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 2

        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = [
            _make_lightning_event(),
            _make_lightning_event(new_strikes=3, cumulative_count=53),
        ]

        mock_db_session.execute = AsyncMock(side_effect=[count_result, items_result])

        resp = await test_client.get("/api/v1/observations/lightning/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["items"][0]["new_strikes"] == 5

    async def test_empty(self, test_client, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 0

        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(side_effect=[count_result, items_result])

        resp = await test_client.get("/api/v1/observations/lightning/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_time_range_filter(self, test_client, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 1

        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = [_make_lightning_event()]

        mock_db_session.execute = AsyncMock(side_effect=[count_result, items_result])

        resp = await test_client.get(
            "/api/v1/observations/lightning/events",
            params={
                "start": "2026-04-05T00:00:00Z",
                "end": "2026-04-05T23:59:59Z",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_filtered_excluded_by_default(self, test_client, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 1

        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = [_make_lightning_event()]

        mock_db_session.execute = AsyncMock(side_effect=[count_result, items_result])

        resp = await test_client.get("/api/v1/observations/lightning/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["filtered"] is False

    async def test_include_filtered_returns_all(self, test_client, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 2

        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = [
            _make_lightning_event(),
            _make_lightning_event(filtered=True, new_strikes=1, distance_km=14.0),
        ]

        mock_db_session.execute = AsyncMock(side_effect=[count_result, items_result])

        resp = await test_client.get(
            "/api/v1/observations/lightning/events",
            params={"include_filtered": "true"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["items"][1]["filtered"] is True


class TestLightningSummary:
    async def test_returns_summary(self, test_client, mock_db_session):
        # Four SQL queries: filtered_count, totals, daily, hourly
        filtered_result = MagicMock()
        filtered_result.scalar.return_value = 3

        totals_result = MagicMock()
        totals_result.mappings.return_value.one.return_value = {
            "total_strikes": 100,
            "event_count": 5,
            "closest_distance": 3.2,
        }

        daily_result = MagicMock()
        daily_result.mappings.return_value.all.return_value = [
            {"date": "2026-04-05", "strikes": 100},
        ]

        hourly_result = MagicMock()
        hourly_result.mappings.return_value.all.return_value = [
            {"bucket": datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc), "strikes": 40, "min_distance": 5.0},
            {"bucket": datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc), "strikes": 60, "min_distance": 3.2},
        ]

        mock_db_session.execute = AsyncMock(
            side_effect=[filtered_result, totals_result, daily_result, hourly_result]
        )

        resp = await test_client.get(
            "/api/v1/observations/lightning/summary",
            params={"start": "2026-04-05T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_strikes"] == 100
        assert data["event_count"] == 5
        assert data["filtered_count"] == 3
        assert data["closest_distance"] == 3.2
        assert len(data["daily"]) == 1
        assert len(data["hourly"]) == 2

    async def test_no_activity(self, test_client, mock_db_session):
        filtered_result = MagicMock()
        filtered_result.scalar.return_value = 0

        totals_result = MagicMock()
        totals_result.mappings.return_value.one.return_value = {
            "total_strikes": 0,
            "event_count": 0,
            "closest_distance": None,
        }

        daily_result = MagicMock()
        daily_result.mappings.return_value.all.return_value = []

        hourly_result = MagicMock()
        hourly_result.mappings.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[filtered_result, totals_result, daily_result, hourly_result]
        )

        resp = await test_client.get(
            "/api/v1/observations/lightning/summary",
            params={"start": "2026-04-05T00:00:00Z", "end": "2026-04-05T23:59:59Z"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_strikes"] == 0
        assert data["filtered_count"] == 0
        assert data["closest_distance"] is None
        assert data["daily"] == []
        assert data["hourly"] == []

    async def test_summary_include_filtered(self, test_client, mock_db_session):
        filtered_result = MagicMock()
        filtered_result.scalar.return_value = 5

        totals_result = MagicMock()
        totals_result.mappings.return_value.one.return_value = {
            "total_strikes": 12,
            "event_count": 8,
            "closest_distance": 10.0,
        }

        daily_result = MagicMock()
        daily_result.mappings.return_value.all.return_value = [
            {"date": "2026-04-05", "strikes": 12},
        ]

        hourly_result = MagicMock()
        hourly_result.mappings.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[filtered_result, totals_result, daily_result, hourly_result]
        )

        resp = await test_client.get(
            "/api/v1/observations/lightning/summary",
            params={
                "start": "2026-04-05T00:00:00Z",
                "end": "2026-04-05T23:59:59Z",
                "include_filtered": "true",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_strikes"] == 12
        assert data["event_count"] == 8
        assert data["filtered_count"] == 5

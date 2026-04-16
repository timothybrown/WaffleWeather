"""Tests for app/api/stations.py endpoints."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock



class TestListStations:
    async def test_returns_list(self, test_client, mock_db_session):
        s1 = MagicMock()
        s1.id = "station-1"
        s1.name = "Main Station"
        s1.model = "GW3000B"
        s1.firmware_version = "3.1.5"
        s1.last_seen = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        s1.latitude = 40.7
        s1.longitude = -74.0
        s1.altitude = 10.0

        result = MagicMock()
        result.scalars.return_value.all.return_value = [s1]
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/stations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "station-1"
        assert data[0]["name"] == "Main Station"

    async def test_empty_list(self, test_client, mock_db_session):
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/stations")
        assert resp.status_code == 200
        assert resp.json() == []


class TestGetStation:
    async def test_found(self, test_client, mock_db_session):
        station = MagicMock()
        station.id = "s1"
        station.name = "Test"
        station.model = None
        station.firmware_version = None
        station.last_seen = None
        station.latitude = None
        station.longitude = None
        station.altitude = None

        result = MagicMock()
        result.scalar_one_or_none.return_value = station
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/stations/s1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "s1"

    async def test_not_found(self, test_client, mock_db_session):
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/stations/nonexistent")
        assert resp.status_code == 404

"""Tests for app/api/observations.py endpoints."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock


class TestGetLatestObservation:
    async def test_happy_path(self, test_client, mock_db_session):
        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "s1"
        fake_obs.temp_outdoor = 22.0
        fake_obs.humidity_outdoor = 50.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = 1013.0
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        # First execute: the observation query
        result_obs = MagicMock()
        result_obs.scalar_one_or_none.return_value = fake_obs

        # Second execute: the pressure history query
        result_pressure = MagicMock()
        result_pressure.scalar_one_or_none.return_value = 1012.5

        mock_db_session.execute = AsyncMock(side_effect=[result_obs, result_pressure])

        resp = await test_client.get("/api/v1/observations/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["station_id"] == "s1"
        assert data["temp_outdoor"] == 22.0
        assert data["zambretti_forecast"] is not None  # computed from 1013 vs 1012.5

    async def test_404_when_no_data(self, test_client, mock_db_session):
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/observations/latest")
        assert resp.status_code == 404

    async def test_no_zambretti_without_pressure(self, test_client, mock_db_session):
        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "s1"
        fake_obs.temp_outdoor = 22.0
        fake_obs.humidity_outdoor = 50.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = None  # no pressure
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        result = MagicMock()
        result.scalar_one_or_none.return_value = fake_obs
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/observations/latest")
        assert resp.status_code == 200
        data = resp.json()
        # Only one DB call (no pressure lookup)
        assert mock_db_session.execute.await_count == 1
        assert data["zambretti_forecast"] is None

    async def test_zambretti_none_when_no_history(self, test_client, mock_db_session):
        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "s1"
        fake_obs.temp_outdoor = 22.0
        fake_obs.humidity_outdoor = 50.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = 1013.0
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        result_obs = MagicMock()
        result_obs.scalar_one_or_none.return_value = fake_obs
        result_pressure = MagicMock()
        result_pressure.scalar_one_or_none.return_value = None  # no 3h history

        mock_db_session.execute = AsyncMock(side_effect=[result_obs, result_pressure])

        resp = await test_client.get("/api/v1/observations/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["zambretti_forecast"] is None

    async def test_uses_cached_forecast_when_populated(self, test_client, mock_db_session):
        """When app.state.latest_forecast has an entry, skip the abs(epoch) DB query."""
        from app.main import app

        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "s1"
        fake_obs.temp_outdoor = 22.0
        fake_obs.humidity_outdoor = 50.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = 1013.0
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        result_obs = MagicMock()
        result_obs.scalar_one_or_none.return_value = fake_obs
        mock_db_session.execute = AsyncMock(side_effect=[result_obs])

        # Populate the in-process forecast cache; /latest should read from it
        # instead of running the pressure-history query.
        app.state.latest_forecast = {"s1": "Fine weather"}
        try:
            resp = await test_client.get("/api/v1/observations/latest")
        finally:
            del app.state.latest_forecast

        assert resp.status_code == 200
        data = resp.json()
        assert data["zambretti_forecast"] == "Fine weather"
        # Exactly one DB call: the observation SELECT. No pressure-history query.
        assert mock_db_session.execute.await_count == 1

    async def test_falls_back_to_db_on_cold_start(self, test_client, mock_db_session):
        """When the forecast cache is empty (no MQTT messages yet), fall back to DB."""
        from app.main import app

        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "s1"
        fake_obs.temp_outdoor = 22.0
        fake_obs.humidity_outdoor = 50.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = 1013.0
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        result_obs = MagicMock()
        result_obs.scalar_one_or_none.return_value = fake_obs
        result_pressure = MagicMock()
        result_pressure.scalar_one_or_none.return_value = 1012.5
        mock_db_session.execute = AsyncMock(side_effect=[result_obs, result_pressure])

        # Empty cache → should fall back to the DB pressure-history query
        app.state.latest_forecast = {}
        try:
            resp = await test_client.get("/api/v1/observations/latest")
        finally:
            del app.state.latest_forecast

        assert resp.status_code == 200
        data = resp.json()
        assert data["zambretti_forecast"] is not None  # computed by fallback path
        # Two DB calls: observation SELECT + pressure-history SELECT
        assert mock_db_session.execute.await_count == 2

    async def test_latest_respects_cached_none_without_running_db_query(
        self, test_client, mock_db_session
    ):
        """When the cache has station_id → None, trust it; DON'T run the abs(epoch) query.

        MQTT writes None into the cache when an observation is processed but the
        station has <3h of pressure history. That None is the authoritative
        "no forecast available" answer — falling back to the DB would return
        None anyway, just after a non-indexable scan.
        """
        from app.main import app

        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "s1"
        fake_obs.temp_outdoor = 22.0
        fake_obs.humidity_outdoor = 50.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = 1013.0
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        result_obs = MagicMock()
        result_obs.scalar_one_or_none.return_value = fake_obs
        mock_db_session.execute = AsyncMock(side_effect=[result_obs])

        # Cache explicitly has station → None (MQTT saw observation but lacked
        # 3h pressure history). This is an authoritative negative answer.
        app.state.latest_forecast = {"s1": None}
        try:
            resp = await test_client.get("/api/v1/observations/latest")
        finally:
            del app.state.latest_forecast

        assert resp.status_code == 200
        data = resp.json()
        assert data["zambretti_forecast"] is None
        # Exactly one DB call: the observation SELECT. No pressure-history query.
        assert mock_db_session.execute.await_count == 1

    async def test_station_id_filter(self, test_client, mock_db_session):
        fake_obs = MagicMock()
        fake_obs.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        fake_obs.station_id = "station-x"
        fake_obs.temp_outdoor = 20.0
        fake_obs.humidity_outdoor = 60.0
        fake_obs.temp_indoor = None
        fake_obs.dewpoint = None
        fake_obs.feels_like = None
        fake_obs.heat_index = None
        fake_obs.wind_chill = None
        fake_obs.frost_point = None
        fake_obs.humidity_indoor = None
        fake_obs.pressure_abs = None
        fake_obs.pressure_rel = None
        fake_obs.wind_speed = None
        fake_obs.wind_gust = None
        fake_obs.wind_dir = None
        fake_obs.rain_rate = None
        fake_obs.rain_daily = None
        fake_obs.rain_weekly = None
        fake_obs.rain_monthly = None
        fake_obs.rain_yearly = None
        fake_obs.rain_event = None
        fake_obs.solar_radiation = None
        fake_obs.uv_index = None
        fake_obs.pm25 = None
        fake_obs.pm10 = None
        fake_obs.co2 = None
        fake_obs.soil_moisture_1 = None
        fake_obs.soil_moisture_2 = None
        fake_obs.lightning_count = None
        fake_obs.lightning_distance = None
        fake_obs.lightning_time = None
        fake_obs.utci = None
        fake_obs.zambretti_forecast = None

        result = MagicMock()
        result.scalar_one_or_none.return_value = fake_obs
        mock_db_session.execute = AsyncMock(return_value=result)

        resp = await test_client.get("/api/v1/observations/latest?station_id=station-x")
        assert resp.status_code == 200
        assert resp.json()["station_id"] == "station-x"


class TestListObservations:
    async def test_paginated_list(self, test_client, mock_db_session):
        # offset=0 → no COUNT; total is None
        obs1 = MagicMock()
        obs1.timestamp = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        obs1.station_id = "s1"
        for f in [
            "temp_outdoor", "temp_indoor", "dewpoint", "feels_like", "heat_index",
            "wind_chill", "frost_point", "humidity_outdoor", "humidity_indoor",
            "pressure_abs", "pressure_rel", "wind_speed", "wind_gust", "wind_dir",
            "rain_rate", "rain_daily", "rain_weekly", "rain_monthly", "rain_yearly",
            "rain_event", "solar_radiation", "uv_index", "pm25", "pm10", "co2",
            "soil_moisture_1", "soil_moisture_2", "lightning_count",
            "lightning_distance", "lightning_time", "utci", "zambretti_forecast",
        ]:
            setattr(obs1, f, None)

        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = [obs1]

        mock_db_session.execute = AsyncMock(side_effect=[items_result])

        resp = await test_client.get("/api/v1/observations?limit=10&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] is None
        assert data["limit"] == 10
        assert data["offset"] == 0
        assert len(data["items"]) == 1

    async def test_empty_list(self, test_client, mock_db_session):
        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = []

        # offset defaults to 0 → no COUNT query is issued
        mock_db_session.execute = AsyncMock(side_effect=[items_result])

        resp = await test_client.get("/api/v1/observations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] is None
        assert data["items"] == []

    async def test_skips_count_when_offset_zero(self, test_client, mock_db_session):
        """When offset=0, do NOT execute a COUNT query (useTrends hot path)."""
        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(side_effect=[items_result])

        resp = await test_client.get("/api/v1/observations?limit=1000&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] is None
        # Exactly one execute: the SELECT data query, no COUNT
        assert mock_db_session.execute.await_count == 1

    async def test_includes_count_when_offset_positive(self, test_client, mock_db_session):
        """When offset>0, still execute COUNT for pagination."""
        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = []

        count_result = MagicMock()
        count_result.scalar.return_value = 42

        # list_observations calls SELECT (data) first, then COUNT when offset>0
        mock_db_session.execute = AsyncMock(side_effect=[items_result, count_result])

        resp = await test_client.get("/api/v1/observations?limit=10&offset=100")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 42
        # Two executes: SELECT data + COUNT
        assert mock_db_session.execute.await_count == 2

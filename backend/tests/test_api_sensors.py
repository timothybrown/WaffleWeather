"""Tests for the auxiliary sensor observations endpoint."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

BASE = "/api/v1/observations/sensors"
WINDOW = {"start": "2026-01-01T00:00:00Z", "end": "2026-01-02T00:00:00Z"}

_SOURCES = {
    "raw": "sensor_observations",
    "hourly": "sensor_observations_hourly",
    "daily": "sensor_observations_daily",
    "monthly": "sensor_observations_monthly",
}


def _result(rows: list[dict[str, object]]) -> MagicMock:
    result = MagicMock()
    result.mappings.return_value.all.return_value = rows
    return result


def _mock_results(
    mock_db_session: MagicMock,
    *,
    rows: list[dict[str, object]] | None = None,
    sensors: list[dict[str, object]] | None = None,
) -> None:
    mock_db_session.execute = AsyncMock(
        side_effect=[
            _result(rows or []),
            _result(sensors or []),
        ]
    )


def _executed_sql(mock_db_session: MagicMock, index: int = 0) -> str:
    return str(mock_db_session.execute.await_args_list[index].args[0])


def _executed_params(mock_db_session: MagicMock, index: int = 0) -> dict[str, object]:
    return mock_db_session.execute.await_args_list[index].args[1]


class TestGranularity:
    async def test_rejects_unknown_granularity(self, test_client, mock_db_session):
        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "yearly"},
        )

        assert response.status_code == 400
        mock_db_session.execute.assert_not_awaited()

    @pytest.mark.parametrize("granularity", ("raw", "hourly", "daily", "monthly"))
    async def test_accepts_each_valid_granularity(
        self,
        granularity: str,
        test_client,
        mock_db_session,
    ):
        _mock_results(mock_db_session)

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": granularity},
        )

        assert response.status_code == 200
        assert f"FROM {_SOURCES[granularity]} WHERE" in _executed_sql(mock_db_session)

    async def test_does_not_interpolate_unknown_granularity_into_sql(
        self,
        test_client,
        mock_db_session,
    ):
        response = await test_client.get(
            BASE,
            params={
                **WINDOW,
                "granularity": "sensor_observations; DROP TABLE sensors; --",
            },
        )

        assert response.status_code == 400
        mock_db_session.execute.assert_not_awaited()


class TestSpanCaps:
    async def test_raw_span_is_capped(self, test_client, mock_db_session):
        response = await test_client.get(
            BASE,
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-01-10T00:00:00Z",
                "granularity": "raw",
            },
        )

        assert response.status_code == 400
        mock_db_session.execute.assert_not_awaited()

    async def test_hourly_span_is_capped(self, test_client, mock_db_session):
        response = await test_client.get(
            BASE,
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-03-01T00:00:00Z",
                "granularity": "hourly",
            },
        )

        assert response.status_code == 400
        mock_db_session.execute.assert_not_awaited()


class TestResponseShape:
    async def test_returns_sensors_and_aggregate_rows(self, test_client, mock_db_session):
        bucket = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        _mock_results(
            mock_db_session,
            rows=[
                {
                    "station_id": "s1",
                    "sensor_key": "gw",
                    "bucket": bucket,
                    "temp_avg": 20.5,
                    "temp_min": 19.0,
                    "temp_max": 22.0,
                    "humidity_avg": 45.0,
                    "humidity_min": 40.0,
                    "humidity_max": 50.0,
                }
            ],
            sensors=[
                {
                    "station_id": "s1",
                    "sensor_key": "gw",
                    "label": "Indoor",
                    "placement": "indoor",
                }
            ],
        )

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "hourly"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["sensors"] == [
            {
                "station_id": "s1",
                "sensor_key": "gw",
                "label": "Indoor",
                "placement": "indoor",
            }
        ]
        assert body["rows"][0]["station_id"] == "s1"
        assert body["rows"][0]["sensor_key"] == "gw"
        assert body["rows"][0]["bucket"] == "2026-01-01T12:00:00Z"
        assert body["rows"][0]["temp_avg"] == 20.5
        assert "timestamp" not in body["rows"][0]

    async def test_returns_raw_rows(self, test_client, mock_db_session):
        timestamp = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        _mock_results(
            mock_db_session,
            rows=[
                {
                    "station_id": "s1",
                    "sensor_key": "gw",
                    "timestamp": timestamp,
                    "temp": 21.0,
                    "humidity": 44.0,
                }
            ],
        )

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "raw"},
        )

        assert response.status_code == 200
        row = response.json()["rows"][0]
        assert row == {
            "station_id": "s1",
            "sensor_key": "gw",
            "timestamp": "2026-01-01T12:00:00Z",
            "temp": 21.0,
            "humidity": 44.0,
        }

    async def test_preserves_selected_null_metrics(self, test_client, mock_db_session):
        timestamp = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        _mock_results(
            mock_db_session,
            rows=[
                {
                    "station_id": "s1",
                    "sensor_key": "gw",
                    "timestamp": timestamp,
                    "temp": None,
                    "humidity": 44.0,
                }
            ],
            sensors=[
                {
                    "station_id": "s1",
                    "sensor_key": "gw",
                    "label": None,
                    "placement": "indoor",
                }
            ],
        )

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "raw"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["sensors"][0]["label"] is None
        assert body["rows"][0]["temp"] is None
        assert body["rows"][0]["humidity"] == 44.0
        assert "bucket" not in body["rows"][0]

    async def test_unknown_sensor_key_returns_empty_not_404(self, test_client, mock_db_session):
        _mock_results(mock_db_session)

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "hourly", "sensor_key": "nope"},
        )

        assert response.status_code == 200
        assert response.json() == {"sensors": [], "rows": []}


class TestQueryBehavior:
    async def test_applies_filters_to_rows_and_metadata(self, test_client, mock_db_session):
        _mock_results(mock_db_session)

        response = await test_client.get(
            BASE,
            params={
                **WINDOW,
                "granularity": "hourly",
                "station_id": "s1",
                "sensor_key": "gw",
            },
        )

        assert response.status_code == 200
        row_sql = _executed_sql(mock_db_session, 0)
        meta_sql = _executed_sql(mock_db_session, 1)
        assert "station_id = :station_id" in row_sql
        assert "sensor_key = :sensor_key" in row_sql
        assert "station_id = :station_id" in meta_sql
        assert "sensor_key = :sensor_key" in meta_sql
        assert _executed_params(mock_db_session, 0)["station_id"] == "s1"
        assert _executed_params(mock_db_session, 0)["sensor_key"] == "gw"
        assert _executed_params(mock_db_session, 1) == {"sensor_key": "gw", "station_id": "s1"}

    async def test_raw_applies_limit(self, test_client, mock_db_session):
        _mock_results(mock_db_session)

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "raw", "limit": 250},
        )

        assert response.status_code == 200
        assert "LIMIT :limit" in _executed_sql(mock_db_session)
        assert _executed_params(mock_db_session)["limit"] == 250

    async def test_aggregate_ignores_limit(self, test_client, mock_db_session):
        _mock_results(mock_db_session)

        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "hourly", "limit": 250},
        )

        assert response.status_code == 200
        assert "LIMIT :limit" not in _executed_sql(mock_db_session)
        assert "limit" not in _executed_params(mock_db_session)

    async def test_limit_rejects_above_ceiling(self, test_client):
        response = await test_client.get(
            BASE,
            params={**WINDOW, "granularity": "raw", "limit": 10001},
        )

        assert response.status_code == 422

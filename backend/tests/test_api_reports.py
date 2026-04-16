"""Tests for app/api/reports.py climate report endpoints."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock



def _make_station():
    s = MagicMock()
    s.id = "test-station"
    s.name = "Test Station"
    s.latitude = 32.95
    s.longitude = -96.82
    s.altitude = 168.0
    return s


def _make_daily_row(day, **overrides):
    """Build a dict resembling a daily aggregate mapping row.

    Key is 'day' because the SQL aliases bucket::date AS day.
    """
    base = {
        "day": date(2026, 4, day),
        "temp_outdoor_avg": 20.0,
        "temp_outdoor_min": 15.0,
        "temp_outdoor_max": 25.0,
        "dewpoint_avg": 13.0,
        "dewpoint_min": 9.0,
        "dewpoint_max": 17.0,
        "humidity_outdoor_avg": 65.0,
        "pressure_rel_avg": 1013.0,
        "wind_speed_avg": 10.0,
        "wind_gust_max": 25.0,
        "rain_daily_max": 0.0,
    }
    base.update(overrides)
    return base


def _make_wind_rows(day, directions):
    """Build a list of (date, wind_dir) tuples for a single day."""
    d = date(2026, 4, day)
    return [(d, wd) for wd in directions]


def _mock_three_calls(station, daily_rows, wind_tuples):
    """Create side_effect list for the 3 sequential DB calls.

    Call 1: station lookup (scalar_one_or_none)
    Call 2: daily aggregate query (mappings)
    Call 3: wind direction query (all — raw tuples)
    """
    # Station result
    station_result = MagicMock()
    station_result.scalar_one_or_none.return_value = station

    # Daily aggregate result
    daily_result = MagicMock()
    daily_result.mappings.return_value.all.return_value = daily_rows

    # Wind direction result
    wind_result = MagicMock()
    wind_result.all.return_value = wind_tuples

    return [station_result, daily_result, wind_result]


class TestMonthlyReportEndpoint:
    async def test_returns_report(self, test_client, mock_db_session):
        station = _make_station()
        daily_rows = [
            _make_daily_row(1, rain_daily_max=5.2),
            _make_daily_row(2, rain_daily_max=0.0),
            _make_daily_row(3, rain_daily_max=1.3),
        ]
        wind_tuples = (
            _make_wind_rows(1, [180.0, 175.0, 185.0])
            + _make_wind_rows(2, [180.0, 190.0])
            + _make_wind_rows(3, [180.0, 170.0, 180.0])
        )

        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, daily_rows, wind_tuples)
        )

        resp = await test_client.get("/api/v1/reports/monthly", params={"year": 2026, "month": 4})
        assert resp.status_code == 200
        data = resp.json()

        # Structure
        assert data["period"]["type"] == "monthly"
        assert data["period"]["year"] == 2026
        assert data["period"]["month"] == 4
        assert data["station"]["name"] == "Test Station"
        assert len(data["rows"]) == 3

        # Wind direction: mostly 180 degrees = S
        assert data["rows"][0]["wind_dir_prevailing"] == "S"

        # Rain totals in summary
        assert data["summary"]["rain_total"] == 6.5
        assert data["summary"]["rain_days"] == 2  # days 1 and 3 have rain > 0

    async def test_no_station_returns_404(self, test_client, mock_db_session):
        station_result = MagicMock()
        station_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=station_result)

        resp = await test_client.get("/api/v1/reports/monthly", params={"year": 2026, "month": 4})
        assert resp.status_code == 404

    async def test_empty_month(self, test_client, mock_db_session):
        station = _make_station()
        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, [], [])
        )

        resp = await test_client.get("/api/v1/reports/monthly", params={"year": 2026, "month": 4})
        assert resp.status_code == 200
        data = resp.json()
        assert data["rows"] == []
        assert data["summary"]["rain_total"] is None

    async def test_invalid_month_rejected(self, test_client, mock_db_session):
        resp = await test_client.get("/api/v1/reports/monthly", params={"year": 2026, "month": 13})
        assert resp.status_code == 422

    async def test_hdd_cdd_computed(self, test_client, mock_db_session):
        station = _make_station()
        # HDD: max(0, 18.3 - 10.0) = 8.3
        # CDD: max(0, 10.0 - 18.3) = 0.0
        cold_row = _make_daily_row(1, temp_outdoor_avg=10.0)
        # HDD: max(0, 18.3 - 25.0) = 0.0
        # CDD: max(0, 25.0 - 18.3) = 6.7
        hot_row = _make_daily_row(2, temp_outdoor_avg=25.0)

        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, [cold_row, hot_row], [])
        )

        resp = await test_client.get("/api/v1/reports/monthly", params={"year": 2026, "month": 4})
        assert resp.status_code == 200
        data = resp.json()

        assert data["rows"][0]["hdd"] == 8.3
        assert data["rows"][0]["cdd"] == 0.0
        assert data["rows"][1]["hdd"] == 0.0
        assert data["rows"][1]["cdd"] == 6.7

        # Summary totals
        assert data["summary"]["hdd_total"] == 8.3
        assert data["summary"]["cdd_total"] == 6.7


class TestYearlyReportEndpoint:
    async def test_returns_yearly_report(self, test_client, mock_db_session):
        station = _make_station()
        # Daily rows spanning 2 months — should be grouped into 2 monthly rows
        daily_rows = [
            {
                "day": date(2026, 3, 15),
                "temp_outdoor_avg": 18.0,
                "temp_outdoor_min": 12.0,
                "temp_outdoor_max": 24.0,
                "dewpoint_avg": 10.0,
                "dewpoint_min": 7.0,
                "dewpoint_max": 14.0,
                "humidity_outdoor_avg": 60.0,
                "pressure_rel_avg": 1012.0,
                "wind_speed_avg": 8.0,
                "wind_gust_max": 20.0,
                "rain_daily_max": 3.0,
            },
            {
                "day": date(2026, 4, 10),
                "temp_outdoor_avg": 22.0,
                "temp_outdoor_min": 16.0,
                "temp_outdoor_max": 28.0,
                "dewpoint_avg": 14.0,
                "dewpoint_min": 10.0,
                "dewpoint_max": 18.0,
                "humidity_outdoor_avg": 70.0,
                "pressure_rel_avg": 1014.0,
                "wind_speed_avg": 12.0,
                "wind_gust_max": 30.0,
                "rain_daily_max": 5.0,
            },
        ]
        wind_tuples = [
            (date(2026, 3, 15), 270.0),
            (date(2026, 4, 10), 90.0),
        ]

        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, daily_rows, wind_tuples)
        )

        resp = await test_client.get("/api/v1/reports/yearly", params={"year": 2026})
        assert resp.status_code == 200
        data = resp.json()

        assert data["period"]["type"] == "yearly"
        assert data["period"]["year"] == 2026
        assert len(data["rows"]) == 2

        # Month 3 (March) row
        mar = data["rows"][0]
        assert mar["month"] == 3
        assert mar["temp_avg"] == 18.0
        assert mar["wind_dir_prevailing"] == "W"

        # Month 4 (April) row
        apr = data["rows"][1]
        assert apr["month"] == 4
        assert apr["temp_avg"] == 22.0
        assert apr["wind_dir_prevailing"] == "E"


class TestMonthlyTxtEndpoint:
    async def test_returns_text(self, test_client, mock_db_session):
        station = _make_station()
        daily_rows = [_make_daily_row(1)]
        wind_tuples = _make_wind_rows(1, [180.0])

        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, daily_rows, wind_tuples)
        )

        resp = await test_client.get("/api/v1/reports/monthly/txt", params={"year": 2026, "month": 4})
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]

        body = resp.text
        assert "CLIMATE REPORT" in body
        assert "APRIL" in body
        assert "Test Station" in body

    async def test_imperial_units(self, test_client, mock_db_session):
        station = _make_station()
        daily_rows = [_make_daily_row(1)]
        wind_tuples = _make_wind_rows(1, [180.0])

        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, daily_rows, wind_tuples)
        )

        resp = await test_client.get(
            "/api/v1/reports/monthly/txt", params={"year": 2026, "month": 4, "units": "imperial"}
        )
        assert resp.status_code == 200
        body = resp.text
        # Imperial headers
        assert "(F)" in body
        assert "(mph)" in body

    async def test_content_disposition_header(self, test_client, mock_db_session):
        station = _make_station()
        daily_rows = [_make_daily_row(1)]
        wind_tuples = _make_wind_rows(1, [180.0])

        mock_db_session.execute = AsyncMock(
            side_effect=_mock_three_calls(station, daily_rows, wind_tuples)
        )

        resp = await test_client.get(
            "/api/v1/reports/monthly/txt", params={"year": 2026, "month": 4}
        )
        assert resp.status_code == 200
        assert resp.headers["content-disposition"] == 'attachment; filename="NOAA-2026-04.txt"'

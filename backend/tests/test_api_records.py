"""Tests for app/api/records.py station records endpoints."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock


def _make_station():
    s = MagicMock()
    s.id = "test-station"
    s.name = "Test Station"
    return s


def _mapping_row(data: dict | None):
    """Create a mock result whose .mappings().first() returns data."""
    result = MagicMock()
    result.mappings.return_value.first.return_value = data
    return result


def _station_result(station):
    """Create a mock result for station lookup (scalar_one_or_none)."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = station
    return result


# 13 daily metrics, each queried for 3 periods = 39, plus 3 rain rate = 42 record queries
_NUM_DAILY_METRICS = 13
_NUM_PERIODS = 3


def _build_get_records_side_effects(
    station,
    record_rows: list[dict | None],
    metadata_row: dict | None,
):
    """Build the full side_effect list for GET /records.

    Call order:
    1. Station lookup (scalar_one_or_none)
    2. 13 daily metrics * 3 periods = 39 record queries (mappings().first())
    3. 3 rain rate queries (mappings().first())
    4. 1 metadata query (mappings().first())
    """
    effects: list[MagicMock] = [_station_result(station)]

    for row in record_rows:
        effects.append(_mapping_row(row))

    effects.append(_mapping_row(metadata_row))

    return effects


def _build_broken_records_side_effects(
    station,
    today_and_hist_pairs: list[tuple[dict | None, dict | None]],
):
    """Build the full side_effect list for GET /records/broken.

    Call order:
    1. Station lookup (scalar_one_or_none)
    2. For each of 13 daily metrics: today query + historical query = 26 calls
    3. Rain rate: today query + historical query = 2 calls
    Total pairs: 14 (13 daily + 1 rain rate)
    """
    effects: list[MagicMock] = [_station_result(station)]

    for today_row, hist_row in today_and_hist_pairs:
        effects.append(_mapping_row(today_row))
        effects.append(_mapping_row(hist_row))

    return effects


class TestGetRecords:
    async def test_returns_records_grouped_by_category(
        self, test_client, mock_db_session
    ):
        station = _make_station()

        # Build 42 record rows: 13 daily metrics * 3 periods + 3 rain rate
        # Each record has a value and a date.
        record_rows: list[dict | None] = []

        # Daily metrics: 13 metrics * 3 periods
        metric_values = [
            # (key, sample_value) for each of 13 metrics
            ("highest_temp", 38.5),
            ("lowest_temp", -5.2),
            ("highest_dewpoint", 25.0),
            ("lowest_dewpoint", -10.0),
            ("highest_wind_gust", 95.0),
            ("highest_wind_speed", 45.0),
            ("highest_rain_daily", 102.3),
            ("highest_humidity", 100.0),
            ("lowest_humidity", 12.0),
            ("highest_pressure", 1045.0),
            ("lowest_pressure", 985.0),
            ("highest_solar_radiation", 1250.0),
            ("highest_uv_index", 12.5),
        ]

        for i, (_key, val) in enumerate(metric_values):
            for period_idx in range(3):
                # Vary value slightly by period for distinctness
                record_rows.append({
                    "value": val - period_idx * 0.1,
                    "record_date": date(2026, 4, 1 + period_idx),
                })

        # Rain rate: 3 periods
        for period_idx in range(3):
            record_rows.append({
                "value": 55.0 - period_idx * 0.5,
                "record_date": date(2026, 4, 5 + period_idx),
            })

        metadata_row = {
            "records_since": date(2025, 1, 1),
            "days_of_data": 480,
        }

        mock_db_session.execute = AsyncMock(
            side_effect=_build_get_records_side_effects(
                station, record_rows, metadata_row
            )
        )

        resp = await test_client.get("/api/v1/records")
        assert resp.status_code == 200
        data = resp.json()

        # Top-level fields
        assert data["station_id"] == "test-station"
        assert data["records_since"] == "2025-01-01"
        assert data["days_of_data"] == 480

        # All 6 categories present
        assert set(data["categories"].keys()) == {
            "temperature",
            "wind",
            "rain",
            "humidity",
            "pressure",
            "solar",
        }

        # Category labels
        assert data["categories"]["temperature"]["label"] == "Temperature"
        assert data["categories"]["wind"]["label"] == "Wind"
        assert data["categories"]["rain"]["label"] == "Rain"

        # Temperature has 4 metrics (highest_temp, lowest_temp, highest/lowest_dewpoint)
        temp_records = data["categories"]["temperature"]["records"]
        assert len(temp_records) == 4
        assert temp_records[0]["metric"] == "highest_temp"
        assert temp_records[0]["label"] == "Highest Temperature"

        # Verify record structure: each metric has this_month, this_year, all_time
        first_metric = temp_records[0]
        assert first_metric["this_month"]["value"] == 38.5
        assert first_metric["this_month"]["date"] == "2026-04-01"
        assert first_metric["this_year"]["value"] == 38.4
        assert first_metric["all_time"]["value"] == 38.3

        # Wind has 2 metrics
        assert len(data["categories"]["wind"]["records"]) == 2

        # Rain has 2 metrics (highest_rain_daily + highest_rain_rate)
        rain_records = data["categories"]["rain"]["records"]
        assert len(rain_records) == 2
        rain_rate = rain_records[1]
        assert rain_rate["metric"] == "highest_rain_rate"
        assert rain_rate["this_month"]["value"] == 55.0

        # Humidity has 2, pressure has 2, solar has 2
        assert len(data["categories"]["humidity"]["records"]) == 2
        assert len(data["categories"]["pressure"]["records"]) == 2
        assert len(data["categories"]["solar"]["records"]) == 2

    async def test_no_station_returns_404(self, test_client, mock_db_session):
        station_result = MagicMock()
        station_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=station_result)

        resp = await test_client.get("/api/v1/records")
        assert resp.status_code == 404

    async def test_no_data_returns_empty_records(
        self, test_client, mock_db_session
    ):
        station = _make_station()

        # All 42 record queries return None (no data)
        num_record_queries = _NUM_DAILY_METRICS * _NUM_PERIODS + _NUM_PERIODS
        record_rows: list[dict | None] = [None] * num_record_queries

        # Metadata with no data
        metadata_row = {
            "records_since": None,
            "days_of_data": 0,
        }

        mock_db_session.execute = AsyncMock(
            side_effect=_build_get_records_side_effects(
                station, record_rows, metadata_row
            )
        )

        resp = await test_client.get("/api/v1/records")
        assert resp.status_code == 200
        data = resp.json()

        assert data["records_since"] is None
        assert data["days_of_data"] == 0

        # All metrics should have null periods
        for _cat_key, category in data["categories"].items():
            for record in category["records"]:
                assert record["this_month"] is None
                assert record["this_year"] is None
                assert record["all_time"] is None


class TestGetBrokenRecords:
    async def test_no_records_broken(self, test_client, mock_db_session):
        """Today's values are below historical records => nothing broken."""
        station = _make_station()

        # 14 metric pairs (13 daily + 1 rain rate).
        # For MAX metrics: today < historical => not broken
        # For MIN metrics: today > historical => not broken
        pairs: list[tuple[dict | None, dict | None]] = []

        # _DAILY_METRICS order and agg:
        # highest_temp (MAX), lowest_temp (MIN), highest_dewpoint (MAX),
        # lowest_dewpoint (MIN), highest_wind_gust (MAX),
        # highest_wind_speed (MAX), highest_rain_daily (MAX),
        # highest_humidity (MAX), lowest_humidity (MIN),
        # highest_pressure (MAX), lowest_pressure (MIN),
        # highest_solar_radiation (MAX), highest_uv_index (MAX)

        agg_funcs = [
            "MAX", "MIN", "MAX", "MIN", "MAX", "MAX", "MAX",
            "MAX", "MIN", "MAX", "MIN", "MAX", "MAX",
        ]

        for agg in agg_funcs:
            if agg == "MAX":
                # Today lower than historical -> not broken
                today_row = {"value": 20.0}
                hist_row = {"value": 30.0, "record_date": date(2025, 7, 15)}
            else:
                # Today higher than historical -> not broken for MIN
                today_row = {"value": 10.0}
                hist_row = {"value": 5.0, "record_date": date(2025, 1, 10)}
            pairs.append((today_row, hist_row))

        # Rain rate (MAX): today lower than historical
        pairs.append((
            {"value": 10.0},
            {"value": 50.0, "record_date": date(2025, 6, 1)},
        ))

        mock_db_session.execute = AsyncMock(
            side_effect=_build_broken_records_side_effects(station, pairs)
        )

        resp = await test_client.get("/api/v1/records/broken")
        assert resp.status_code == 200
        data = resp.json()

        assert data["station_id"] == "test-station"
        assert data["date"] is not None

        # All broken values should be null (no records broken)
        for _key, value in data["broken"].items():
            assert value is None

    async def test_record_broken_today(self, test_client, mock_db_session):
        """Today's highest_temp exceeds historical record."""
        station = _make_station()

        pairs: list[tuple[dict | None, dict | None]] = []

        agg_funcs = [
            "MAX", "MIN", "MAX", "MIN", "MAX", "MAX", "MAX",
            "MAX", "MIN", "MAX", "MIN", "MAX", "MAX",
        ]

        for i, agg in enumerate(agg_funcs):
            if i == 0:
                # First metric = highest_temp: today BEATS historical
                today_row = {"value": 42.0}
                hist_row = {"value": 38.5, "record_date": date(2025, 8, 3)}
            elif agg == "MAX":
                # Other MAX metrics: today below historical
                today_row = {"value": 20.0}
                hist_row = {"value": 30.0, "record_date": date(2025, 7, 15)}
            else:
                # MIN metrics: today above historical
                today_row = {"value": 10.0}
                hist_row = {"value": 5.0, "record_date": date(2025, 1, 10)}
            pairs.append((today_row, hist_row))

        # Rain rate: not broken
        pairs.append((
            {"value": 10.0},
            {"value": 50.0, "record_date": date(2025, 6, 1)},
        ))

        mock_db_session.execute = AsyncMock(
            side_effect=_build_broken_records_side_effects(station, pairs)
        )

        resp = await test_client.get("/api/v1/records/broken")
        assert resp.status_code == 200
        data = resp.json()

        assert data["station_id"] == "test-station"

        # highest_temp should be broken
        broken_temp = data["broken"]["highest_temp"]
        assert broken_temp is not None
        assert broken_temp["is_broken"] is True
        assert broken_temp["current_value"] == 42.0
        assert broken_temp["previous_value"] == 38.5
        assert broken_temp["previous_date"] == "2025-08-03"

        # All other metrics should be null (not broken)
        for key, value in data["broken"].items():
            if key != "highest_temp":
                assert value is None, f"Expected {key} to be None"

    async def test_no_station_returns_404(self, test_client, mock_db_session):
        station_result = MagicMock()
        station_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=station_result)

        resp = await test_client.get("/api/v1/records/broken")
        assert resp.status_code == 404

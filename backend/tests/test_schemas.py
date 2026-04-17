"""Tests for Pydantic schemas — derived field computation and construction."""

from datetime import date, datetime, timezone

from app.schemas.lightning import (
    LightningDailySchema,
    LightningEventPageSchema,
    LightningEventSchema,
    LightningHourlySchema,
    LightningSummarySchema,
)
from app.schemas.observation import (
    AggregatedObservationSchema,
    CalendarDataPointSchema,
    ObservationPageSchema,
    ObservationSchema,
    WindRoseDataPointSchema,
)
from app.schemas.station import StationSchema


class TestObservationSchema:
    def test_derived_fields_computed(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            temp_outdoor=22.0,
            humidity_outdoor=50.0,
        )
        assert obs.dewpoint is not None
        assert 9.0 <= obs.dewpoint <= 12.0
        assert obs.feels_like is not None
        assert obs.heat_index is None  # 22C below threshold

    def test_derived_with_wind(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            temp_outdoor=-5.0,
            humidity_outdoor=80.0,
            wind_speed=20.0,
        )
        assert obs.wind_chill is not None
        assert obs.wind_chill < -5.0

    def test_utci_computed_with_full_data(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            temp_outdoor=22.0,
            humidity_outdoor=50.0,
            wind_speed=10.0,
            solar_radiation=300.0,
        )
        assert obs.utci is not None

    def test_utci_not_computed_without_solar(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            temp_outdoor=22.0,
            humidity_outdoor=50.0,
            wind_speed=10.0,
        )
        assert obs.utci is None

    def test_pre_populated_dewpoint_not_overwritten(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            temp_outdoor=22.0,
            humidity_outdoor=50.0,
            dewpoint=99.9,
        )
        assert obs.dewpoint == 99.9

    def test_no_temp_skips_all_derived(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            humidity_outdoor=50.0,
        )
        assert obs.dewpoint is None
        assert obs.feels_like is None
        assert obs.heat_index is None

    def test_from_attributes_mode(self):
        """from_attributes allows construction from ORM-like objects."""

        class FakeRow:
            timestamp = datetime(2026, 4, 5, tzinfo=timezone.utc)
            station_id = "s1"
            temp_outdoor = 20.0
            humidity_outdoor = 50.0
            temp_indoor = None
            dewpoint = None
            feels_like = None
            heat_index = None
            wind_chill = None
            frost_point = None
            humidity_indoor = None
            pressure_abs = None
            pressure_rel = None
            wind_speed = None
            wind_gust = None
            wind_dir = None
            rain_rate = None
            rain_daily = None
            rain_weekly = None
            rain_monthly = None
            rain_yearly = None
            rain_event = None
            solar_radiation = None
            uv_index = None
            pm25 = None
            pm10 = None
            co2 = None
            soil_moisture_1 = None
            soil_moisture_2 = None
            lightning_count = None
            lightning_distance = None
            lightning_time = None
            utci = None
            zambretti_forecast = None

        obs = ObservationSchema.model_validate(FakeRow())
        assert obs.station_id == "s1"
        assert obs.dewpoint is not None  # computed from temp+rh

    def test_zambretti_not_auto_computed(self):
        obs = ObservationSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            pressure_rel=1013.0,
        )
        assert obs.zambretti_forecast is None


class TestObservationPageSchema:
    def test_construction(self):
        page = ObservationPageSchema(items=[], total=0, limit=50, offset=0)
        assert page.total == 0
        assert page.items == []

    def test_total_defaults_to_none(self):
        """`total` is Optional[int] with default None so the hot path
        (offset=0) can skip COUNT(*) without returning a bogus zero that
        clients might render as "0 results"."""
        page = ObservationPageSchema(items=[], limit=50, offset=0)
        assert page.total is None


class TestCalendarDataPointSchema:
    def test_construction(self):
        dp = CalendarDataPointSchema(date=date(2026, 4, 5), value=22.5)
        assert dp.date == date(2026, 4, 5)
        assert dp.value == 22.5

    def test_null_value(self):
        dp = CalendarDataPointSchema(date=date(2026, 4, 5))
        assert dp.value is None


class TestWindRoseDataPointSchema:
    def test_construction(self):
        dp = WindRoseDataPointSchema(direction=180.0, speed_range="0-5", count=10)
        assert dp.direction == 180.0
        assert dp.speed_range == "0-5"
        assert dp.count == 10


class TestAggregatedObservationSchema:
    def test_construction(self):
        agg = AggregatedObservationSchema(
            bucket=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            station_id="s1",
            temp_outdoor_avg=22.0,
            temp_outdoor_min=18.0,
            temp_outdoor_max=26.0,
        )
        assert agg.temp_outdoor_avg == 22.0
        assert agg.rain_daily_max is None  # optional, defaults to None


class TestStationSchema:
    def test_construction(self):
        s = StationSchema(id="test-station", name="My Station")
        assert s.id == "test-station"
        assert s.firmware_version is None

    def test_from_attributes(self):
        class FakeStation:
            id = "s1"
            name = "Test"
            model = "GW3000B"
            firmware_version = "3.1.5"
            last_seen = datetime(2026, 4, 5, tzinfo=timezone.utc)
            latitude = 40.7
            longitude = -74.0
            altitude = 10.0

        s = StationSchema.model_validate(FakeStation())
        assert s.model == "GW3000B"
        assert s.latitude == 40.7


class TestLightningSchemas:
    def test_event_schema(self):
        e = LightningEventSchema(
            timestamp=datetime(2026, 4, 5, tzinfo=timezone.utc),
            station_id="s1",
            new_strikes=5,
            distance_km=12.0,
            cumulative_count=50,
            filtered=False,
        )
        assert e.new_strikes == 5
        assert e.filtered is False

    def test_event_page_schema(self):
        page = LightningEventPageSchema(items=[], total=0, limit=50, offset=0)
        assert page.items == []

    def test_daily_schema(self):
        d = LightningDailySchema(date="2026-04-05", strikes=10)
        assert d.strikes == 10

    def test_hourly_schema(self):
        h = LightningHourlySchema(bucket="2026-04-05T12:00:00Z", strikes=3, min_distance=8.5)
        assert h.min_distance == 8.5

    def test_summary_schema(self):
        s = LightningSummarySchema(
            total_strikes=100,
            event_count=5,
            filtered_count=3,
            closest_distance=3.2,
            daily=[LightningDailySchema(date="2026-04-05", strikes=100)],
            hourly=[],
        )
        assert s.total_strikes == 100
        assert s.filtered_count == 3
        assert len(s.daily) == 1

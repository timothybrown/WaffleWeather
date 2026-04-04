"""Pydantic schemas for weather observations."""

from datetime import date, datetime

from pydantic import BaseModel, model_validator

from app.services.derived import dew_point, feels_like, heat_index, utci, wind_chill


class ObservationSchema(BaseModel):
    timestamp: datetime
    station_id: str
    # Temperature
    temp_outdoor: float | None = None
    temp_indoor: float | None = None
    dewpoint: float | None = None
    feels_like: float | None = None
    heat_index: float | None = None
    wind_chill: float | None = None
    frost_point: float | None = None
    # Humidity
    humidity_outdoor: float | None = None
    humidity_indoor: float | None = None
    # Pressure
    pressure_abs: float | None = None
    pressure_rel: float | None = None
    # Wind
    wind_speed: float | None = None
    wind_gust: float | None = None
    wind_dir: float | None = None
    # Rain
    rain_rate: float | None = None
    rain_daily: float | None = None
    rain_weekly: float | None = None
    rain_monthly: float | None = None
    rain_yearly: float | None = None
    rain_event: float | None = None
    # Solar / UV
    solar_radiation: float | None = None
    uv_index: float | None = None
    # Air Quality
    pm25: float | None = None
    pm10: float | None = None
    co2: float | None = None
    # Soil
    soil_moisture_1: float | None = None
    soil_moisture_2: float | None = None
    # Lightning
    lightning_count: int | None = None
    lightning_distance: float | None = None
    lightning_time: datetime | None = None
    # Derived — thermal comfort
    utci: float | None = None
    # Derived — Zambretti forecast (set explicitly, not in model_validator;
    # requires 3h pressure history which needs DB/memory access)
    zambretti_forecast: str | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_derived(self) -> "ObservationSchema":
        """Compute derived fields on the fly if raw inputs are available."""
        temp = self.temp_outdoor
        rh = self.humidity_outdoor
        wind = self.wind_speed

        if temp is not None and rh is not None:
            if self.dewpoint is None:
                self.dewpoint = dew_point(temp, rh)
            if self.heat_index is None:
                self.heat_index = heat_index(temp, rh)
            if self.feels_like is None:
                self.feels_like = feels_like(temp, rh, wind)

        if temp is not None and wind is not None and self.wind_chill is None:
            self.wind_chill = wind_chill(temp, wind)

        solar = self.solar_radiation
        if (
            temp is not None
            and rh is not None
            and wind is not None
            and solar is not None
            and self.utci is None
        ):
            self.utci = utci(temp, rh, wind, solar)

        return self


class ObservationPageSchema(BaseModel):
    items: list[ObservationSchema]
    total: int
    limit: int
    offset: int


class CalendarDataPointSchema(BaseModel):
    date: date
    value: float | None = None


class WindRoseDataPointSchema(BaseModel):
    direction: float
    speed_range: str
    count: int


class AggregatedObservationSchema(BaseModel):
    bucket: datetime
    station_id: str
    temp_outdoor_avg: float | None = None
    temp_outdoor_min: float | None = None
    temp_outdoor_max: float | None = None
    humidity_outdoor_avg: float | None = None
    pressure_rel_avg: float | None = None
    wind_speed_avg: float | None = None
    wind_gust_max: float | None = None
    rain_daily_max: float | None = None
    solar_radiation_avg: float | None = None
    uv_index_max: float | None = None

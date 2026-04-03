"""Pydantic schemas for WebSocket messages."""

from datetime import datetime

from pydantic import BaseModel


class LiveObservationMessage(BaseModel):
    """Message sent to WebSocket clients when a new observation arrives."""

    type: str = "observation"
    timestamp: datetime
    station_id: str
    temp_outdoor: float | None = None
    temp_indoor: float | None = None
    dewpoint: float | None = None
    feels_like: float | None = None
    heat_index: float | None = None
    wind_chill: float | None = None
    frost_point: float | None = None
    humidity_outdoor: float | None = None
    humidity_indoor: float | None = None
    pressure_abs: float | None = None
    pressure_rel: float | None = None
    wind_speed: float | None = None
    wind_gust: float | None = None
    wind_dir: float | None = None
    rain_rate: float | None = None
    rain_daily: float | None = None
    rain_weekly: float | None = None
    rain_monthly: float | None = None
    rain_yearly: float | None = None
    rain_event: float | None = None
    solar_radiation: float | None = None
    uv_index: float | None = None
    pm25: float | None = None
    pm10: float | None = None
    co2: float | None = None
    soil_moisture_1: float | None = None
    soil_moisture_2: float | None = None
    lightning_count: int | None = None
    lightning_distance: float | None = None
    lightning_time: datetime | None = None

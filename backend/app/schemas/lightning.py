"""Pydantic schemas for lightning events."""

from datetime import datetime

from pydantic import BaseModel


class LightningEventSchema(BaseModel):
    timestamp: datetime
    station_id: str
    new_strikes: int
    distance_km: float | None = None
    cumulative_count: int

    model_config = {"from_attributes": True}


class LightningEventPageSchema(BaseModel):
    items: list[LightningEventSchema]
    total: int
    limit: int
    offset: int


class LightningDailySchema(BaseModel):
    date: str
    strikes: int


class LightningHourlySchema(BaseModel):
    bucket: str
    strikes: int
    min_distance: float | None = None


class LightningSummarySchema(BaseModel):
    total_strikes: int
    event_count: int
    closest_distance: float | None = None
    daily: list[LightningDailySchema]
    hourly: list[LightningHourlySchema]

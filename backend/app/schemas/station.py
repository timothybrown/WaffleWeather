"""Pydantic schemas for weather stations."""

from datetime import datetime

from pydantic import BaseModel


class StationSchema(BaseModel):
    id: str
    name: str | None = None
    model: str | None = None
    firmware_version: str | None = None
    last_seen: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    altitude: float | None = None
    timezone: str | None = None

    model_config = {"from_attributes": True}

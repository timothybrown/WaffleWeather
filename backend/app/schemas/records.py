"""Pydantic schemas for station records endpoints."""

from datetime import date as date_type

from pydantic import BaseModel


class RecordEntry(BaseModel):
    """A single record value with its date of occurrence."""
    value: float
    date: date_type


class RecordMetric(BaseModel):
    """A record metric with values across time periods."""
    metric: str
    label: str
    this_month: RecordEntry | None = None
    this_year: RecordEntry | None = None
    all_time: RecordEntry | None = None


class RecordCategory(BaseModel):
    """A category grouping related record metrics."""
    label: str
    records: list[RecordMetric]


class RecordsResponse(BaseModel):
    """Full response for GET /api/v1/records."""
    station_id: str
    records_since: date_type | None = None
    days_of_data: int
    categories: dict[str, RecordCategory]


class BrokenRecord(BaseModel):
    """Details about a broken all-time record."""
    is_broken: bool
    current_value: float
    previous_value: float
    previous_date: date_type


class BrokenRecordsResponse(BaseModel):
    """Full response for GET /api/v1/records/broken."""
    station_id: str
    date: date_type
    broken: dict[str, BrokenRecord | None]

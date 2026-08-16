"""Auxiliary sensor observation endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.aggregates import _validate_span
from app.database import get_db
from app.schemas.observation import (
    SensorMetaSchema,
    SensorObservationsResponse,
    SensorReadingSchema,
)

router = APIRouter(prefix="/observations", tags=["sensors"])

# Allowlisted granularity -> source relation. Prevents SQL injection via the
# query parameter and keeps the readable relations explicit.
_GRANULARITY_SOURCES = {
    "raw": "sensor_observations",
    "hourly": "sensor_observations_hourly",
    "daily": "sensor_observations_daily",
    "monthly": "sensor_observations_monthly",
}

_RAW_COLUMNS = "station_id, sensor_key, timestamp, temp, humidity"
_AGG_COLUMNS = (
    "station_id, sensor_key, bucket, "
    "temp_avg, temp_min, temp_max, "
    "humidity_avg, humidity_min, humidity_max"
)


@router.get(
    "/sensors",
    response_model=SensorObservationsResponse,
    response_model_exclude_unset=True,
)
async def list_sensor_observations(
    start: datetime = Query(...),
    end: datetime = Query(...),
    granularity: str = Query("raw"),
    sensor_key: str | None = Query(None),
    station_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    db: AsyncSession = Depends(get_db),
) -> SensorObservationsResponse:
    source = _GRANULARITY_SOURCES.get(granularity)
    if source is None:
        raise HTTPException(status_code=400, detail=f"Invalid granularity: {granularity}")

    _validate_span(granularity, start, end)

    is_raw = granularity == "raw"
    time_column = "timestamp" if is_raw else "bucket"
    columns = _RAW_COLUMNS if is_raw else _AGG_COLUMNS

    where = [f"{time_column} >= :start", f"{time_column} <= :end"]
    params: dict[str, object] = {"start": start, "end": end}

    if sensor_key:
        where.append("sensor_key = :sensor_key")
        params["sensor_key"] = sensor_key
    if station_id:
        where.append("station_id = :station_id")
        params["station_id"] = station_id

    sql = (
        f"SELECT {columns} FROM {source} "
        f"WHERE {' AND '.join(where)} "
        f"ORDER BY {time_column} DESC"
    )
    if is_raw:
        sql += " LIMIT :limit"
        params["limit"] = limit

    rows_result = await db.execute(text(sql), params)
    rows = rows_result.mappings().all()

    meta_where = ["1 = 1"]
    meta_params: dict[str, object] = {}
    if sensor_key:
        meta_where.append("sensor_key = :sensor_key")
        meta_params["sensor_key"] = sensor_key
    if station_id:
        meta_where.append("station_id = :station_id")
        meta_params["station_id"] = station_id

    meta_result = await db.execute(
        text(
            "SELECT station_id, sensor_key, label, placement FROM sensors "
            f"WHERE {' AND '.join(meta_where)} ORDER BY station_id, sensor_key"
        ),
        meta_params,
    )
    meta_rows = meta_result.mappings().all()

    return SensorObservationsResponse(
        sensors=[SensorMetaSchema(**dict(row)) for row in meta_rows],
        rows=[SensorReadingSchema(**dict(row)) for row in rows],
    )

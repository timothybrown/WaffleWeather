"""Aggregate observation API endpoints (hourly, daily, monthly)."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.observation import AggregatedObservationSchema

router = APIRouter(prefix="/observations", tags=["aggregates"])

# Column list shared across all aggregate views
_AGG_COLUMNS = (
    "station_id, bucket, "
    "temp_outdoor_avg, temp_outdoor_min, temp_outdoor_max, "
    "humidity_outdoor_avg, pressure_rel_avg, "
    "wind_speed_avg, wind_gust_max, "
    "rain_daily_max, solar_radiation_avg, uv_index_max"
)


async def _query_aggregate(
    view: str,
    station_id: str | None,
    start: datetime,
    end: datetime,
    db: AsyncSession,
) -> list[AggregatedObservationSchema]:
    where_clauses = ["bucket >= :start", "bucket <= :end"]
    params: dict = {"start": start, "end": end}

    if station_id:
        where_clauses.append("station_id = :station_id")
        params["station_id"] = station_id

    where = " AND ".join(where_clauses)
    sql = text(f"SELECT {_AGG_COLUMNS} FROM {view} WHERE {where} ORDER BY bucket DESC")

    result = await db.execute(sql, params)
    rows = result.mappings().all()
    return [AggregatedObservationSchema(**row) for row in rows]


@router.get("/hourly", response_model=list[AggregatedObservationSchema])
async def list_hourly_observations(
    start: datetime = Query(...),
    end: datetime = Query(...),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await _query_aggregate("observations_hourly", station_id, start, end, db)


@router.get("/daily", response_model=list[AggregatedObservationSchema])
async def list_daily_observations(
    start: datetime = Query(...),
    end: datetime = Query(...),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await _query_aggregate("observations_daily", station_id, start, end, db)


@router.get("/monthly", response_model=list[AggregatedObservationSchema])
async def list_monthly_observations(
    start: datetime = Query(...),
    end: datetime = Query(...),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await _query_aggregate("observations_monthly", station_id, start, end, db)

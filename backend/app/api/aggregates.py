"""Aggregate observation API endpoints (hourly, daily, monthly, calendar)."""

from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.observation import (
    AggregatedObservationSchema,
    CalendarDataPointSchema,
    WindRoseDataPointSchema,
)

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


# Allowlist of valid metric column names for the calendar endpoint
_CALENDAR_METRICS = {
    "temp_outdoor_max",
    "rain_daily_max",
    "solar_radiation_avg",
    "wind_gust_max",
    "humidity_outdoor_avg",
    "lightning_strikes",
}


@router.get("/calendar", response_model=list[CalendarDataPointSchema])
async def get_calendar_data(
    metric: str = Query(...),
    year: int | None = Query(None),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if metric not in _CALENDAR_METRICS:
        raise HTTPException(status_code=400, detail=f"Invalid metric: {metric}")

    target_year = year or date.today().year
    start = datetime(target_year, 1, 1)
    end = datetime(target_year, 12, 31, 23, 59, 59)

    # Lightning strikes come from lightning_events table, not daily aggregates
    if metric == "lightning_strikes":
        where_clauses = ["timestamp >= :start", "timestamp <= :end"]
        params: dict = {"start": start, "end": end}
        if station_id:
            where_clauses.append("station_id = :station_id")
            params["station_id"] = station_id
        where = " AND ".join(where_clauses)
        sql = text(
            f"SELECT timestamp::date AS date, SUM(new_strikes) AS value "
            f"FROM lightning_events WHERE {where} "
            f"GROUP BY timestamp::date ORDER BY date"
        )
    else:
        where_clauses = ["bucket >= :start", "bucket <= :end"]
        params = {"start": start, "end": end}
        if station_id:
            where_clauses.append("station_id = :station_id")
            params["station_id"] = station_id
        where = " AND ".join(where_clauses)
        # metric is from the allowlist so safe to interpolate
        sql = text(
            f"SELECT bucket::date AS date, {metric} AS value "
            f"FROM observations_daily WHERE {where} ORDER BY date"
        )

    result = await db.execute(sql, params)
    rows = result.mappings().all()
    return [CalendarDataPointSchema(date=row["date"], value=row["value"]) for row in rows]


# Wind rose: 16 direction sectors × 5 speed bands (km/h)
_WIND_SECTORS = 16
_SECTOR_SIZE = 360.0 / _WIND_SECTORS
_SPEED_BANDS = [
    (0, 5, "0-5"),
    (5, 15, "5-15"),
    (15, 25, "15-25"),
    (25, 40, "25-40"),
    (40, float("inf"), "40+"),
]


@router.get("/wind-rose", response_model=list[WindRoseDataPointSchema])
async def get_wind_rose_data(
    start: datetime = Query(...),
    end: datetime = Query(...),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    where_clauses = [
        "timestamp >= :start",
        "timestamp <= :end",
        "wind_dir IS NOT NULL",
        "wind_speed IS NOT NULL",
    ]
    params: dict = {"start": start, "end": end}

    if station_id:
        where_clauses.append("station_id = :station_id")
        params["station_id"] = station_id

    where = " AND ".join(where_clauses)
    sql = text(f"SELECT wind_dir, wind_speed FROM weather_observations WHERE {where}")

    result = await db.execute(sql, params)
    rows = result.all()

    # Bin into sectors × speed bands
    bins: dict[tuple[float, str], int] = {}
    for sector_i in range(_WIND_SECTORS):
        center = sector_i * _SECTOR_SIZE
        for _, _, label in _SPEED_BANDS:
            bins[(center, label)] = 0

    for wind_dir, wind_speed in rows:
        sector_i = round(wind_dir / _SECTOR_SIZE) % _WIND_SECTORS
        center = sector_i * _SECTOR_SIZE
        for lo, hi, label in _SPEED_BANDS:
            if lo <= wind_speed < hi:
                bins[(center, label)] += 1
                break

    return [
        WindRoseDataPointSchema(direction=d, speed_range=s, count=c)
        for (d, s), c in bins.items()
        if c > 0
    ]

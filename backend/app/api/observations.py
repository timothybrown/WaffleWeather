"""Observation API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.observation import WeatherObservation
from app.schemas.observation import ObservationPageSchema, ObservationSchema

router = APIRouter(prefix="/observations", tags=["observations"])


@router.get("/latest", response_model=ObservationSchema)
async def get_latest_observation(
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(WeatherObservation).order_by(WeatherObservation.timestamp.desc()).limit(1)
    if station_id:
        query = query.where(WeatherObservation.station_id == station_id)

    result = await db.execute(query)
    obs = result.scalar_one_or_none()
    if obs is None:
        raise HTTPException(status_code=404, detail="No observations found")
    return obs


@router.get("", response_model=ObservationPageSchema)
async def list_observations(
    station_id: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    base = select(WeatherObservation)
    count_base = select(func.count()).select_from(WeatherObservation)

    if station_id:
        base = base.where(WeatherObservation.station_id == station_id)
        count_base = count_base.where(WeatherObservation.station_id == station_id)
    if start:
        base = base.where(WeatherObservation.timestamp >= start)
        count_base = count_base.where(WeatherObservation.timestamp >= start)
    if end:
        base = base.where(WeatherObservation.timestamp <= end)
        count_base = count_base.where(WeatherObservation.timestamp <= end)

    total_result = await db.execute(count_base)
    total = total_result.scalar()

    query = base.order_by(WeatherObservation.timestamp.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return ObservationPageSchema(items=items, total=total, limit=limit, offset=offset)

"""Station API endpoints."""

from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.station import Station
from app.schemas.station import StationSchema

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("", response_model=list[StationSchema])
async def list_stations(db: AsyncSession = Depends(get_db)) -> Sequence[Station]:
    result = await db.execute(select(Station).order_by(Station.id))
    return result.scalars().all()


@router.get("/{station_id}", response_model=StationSchema)
async def get_station(station_id: str, db: AsyncSession = Depends(get_db)) -> Station:
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return station

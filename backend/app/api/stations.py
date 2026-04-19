"""Station API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.database import get_db
from app.models.station import Station
from app.schemas.station import StationSchema

router = APIRouter(prefix="/stations", tags=["stations"])


def _station_to_schema(station: Station) -> StationSchema:
    schema = StationSchema.model_validate(station)
    schema.timezone = Settings().station_timezone
    return schema


@router.get("", response_model=list[StationSchema])
async def list_stations(db: AsyncSession = Depends(get_db)) -> list[StationSchema]:
    result = await db.execute(select(Station).order_by(Station.id))
    return [_station_to_schema(s) for s in result.scalars().all()]


@router.get("/{station_id}", response_model=StationSchema)
async def get_station(station_id: str, db: AsyncSession = Depends(get_db)) -> StationSchema:
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return _station_to_schema(station)

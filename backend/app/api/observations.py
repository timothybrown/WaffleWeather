"""Observation API endpoints."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.database import get_db
from app.models.observation import WeatherObservation
from app.schemas.observation import ObservationPageSchema, ObservationSchema
from app.services.derived import zambretti_forecast

router = APIRouter(prefix="/observations", tags=["observations"])


@router.get("/latest", response_model=ObservationSchema)
async def get_latest_observation(
    request: Request,
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

    schema = ObservationSchema.model_validate(obs)

    # Zambretti forecast: read from in-process cache populated by the MQTT
    # listener. Use `in` membership (not truthiness) to distinguish:
    #   - cache miss (key absent): cold start / this station unseen → DB fallback
    #   - cached None (key present, value None): MQTT processed an observation
    #     but had <3h of pressure history → authoritative "no forecast". Running
    #     the abs(epoch) DB query would also return None, just slower.
    if schema.pressure_rel is not None:
        forecast_cache = getattr(request.app.state, "latest_forecast", None)
        if forecast_cache is not None and obs.station_id in forecast_cache:
            schema.zambretti_forecast = forecast_cache[obs.station_id]
        else:
            # Cache miss — run the legacy DB lookup so cold-start still works.
            # The abs(epoch) sort is non-indexable but this path only fires
            # until the next MQTT message populates the cache.
            three_h_ago = obs.timestamp - timedelta(hours=3)
            window_start = three_h_ago - timedelta(minutes=15)
            window_end = three_h_ago + timedelta(minutes=15)
            past_q = (
                select(WeatherObservation.pressure_rel)
                .where(
                    WeatherObservation.station_id == obs.station_id,
                    WeatherObservation.timestamp.between(window_start, window_end),
                    WeatherObservation.pressure_rel.is_not(None),
                )
                .order_by(
                    func.abs(
                        func.extract("epoch", WeatherObservation.timestamp)
                        - func.extract("epoch", three_h_ago)
                    )
                )
                .limit(1)
            )
            past_result = await db.execute(past_q)
            pressure_3h = past_result.scalar_one_or_none()
            _settings = Settings()
            schema.zambretti_forecast = zambretti_forecast(
                schema.pressure_rel,
                pressure_3h,
                wind_dir=schema.wind_dir,
                month=obs.timestamp.month,
                north=_settings.station_latitude is None or _settings.station_latitude >= 0,
            )

    return schema


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

    if station_id:
        base = base.where(WeatherObservation.station_id == station_id)
    if start:
        base = base.where(WeatherObservation.timestamp >= start)
    if end:
        base = base.where(WeatherObservation.timestamp <= end)

    query = base.order_by(WeatherObservation.timestamp.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    # Skip the COUNT(*) hypertable scan on the hot path. The common caller
    # (useTrends, polled every 60s) requests offset=0 and never reads total.
    # Only pay for the count when the client is actually paginating.
    total: int | None = None
    if offset > 0:
        count_base = select(func.count()).select_from(WeatherObservation)
        if station_id:
            count_base = count_base.where(WeatherObservation.station_id == station_id)
        if start:
            count_base = count_base.where(WeatherObservation.timestamp >= start)
        if end:
            count_base = count_base.where(WeatherObservation.timestamp <= end)
        total_result = await db.execute(count_base)
        total = total_result.scalar()

    return ObservationPageSchema(items=items, total=total, limit=limit, offset=offset)

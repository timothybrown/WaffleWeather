"""Lightning event API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.lightning import LightningEvent
from app.schemas.lightning import (
    LightningEventPageSchema,
    LightningSummarySchema,
)

router = APIRouter(prefix="/observations/lightning", tags=["lightning"])


@router.get("/events", response_model=LightningEventPageSchema)
async def list_lightning_events(
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    station_id: str | None = Query(None),
    include_filtered: bool = Query(False),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> LightningEventPageSchema:
    """List lightning events with optional time range filtering."""
    base = select(LightningEvent)
    count_base = select(func.count()).select_from(LightningEvent)

    if not include_filtered:
        base = base.where(LightningEvent.filtered == False)  # noqa: E712
        count_base = count_base.where(LightningEvent.filtered == False)  # noqa: E712
    if station_id:
        base = base.where(LightningEvent.station_id == station_id)
        count_base = count_base.where(LightningEvent.station_id == station_id)
    if start:
        base = base.where(LightningEvent.timestamp >= start)
        count_base = count_base.where(LightningEvent.timestamp >= start)
    if end:
        base = base.where(LightningEvent.timestamp <= end)
        count_base = count_base.where(LightningEvent.timestamp <= end)

    total_result = await db.execute(count_base)
    total = total_result.scalar()

    query = base.order_by(LightningEvent.timestamp.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return LightningEventPageSchema(items=items, total=total, limit=limit, offset=offset)


@router.get("/summary", response_model=LightningSummarySchema)
async def get_lightning_summary(
    start: datetime = Query(...),
    end: datetime = Query(...),
    station_id: str | None = Query(None),
    include_filtered: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> LightningSummarySchema:
    """Get lightning activity summary for a time period."""
    base_clauses = ["timestamp >= :start", "timestamp <= :end"]
    params: dict[str, object] = {"start": start, "end": end}

    if station_id:
        base_clauses.append("station_id = :station_id")
        params["station_id"] = station_id

    base_where = " AND ".join(base_clauses)

    # Build the main where clause (optionally excluding filtered events)
    if include_filtered:
        where = base_where
    else:
        where = base_where + " AND filtered = false"

    # Count of filtered events in the period (always uses base_where)
    filtered_sql = text(
        f"SELECT COUNT(*) AS cnt FROM lightning_events "
        f"WHERE {base_where} AND filtered = true"
    )
    filtered_count = (await db.execute(filtered_sql, params)).scalar() or 0

    # Total strikes and event count
    totals_sql = text(
        f"SELECT COALESCE(SUM(new_strikes), 0) AS total_strikes, "
        f"COUNT(*) AS event_count, "
        f"MIN(distance_km) AS closest_distance "
        f"FROM lightning_events WHERE {where}"
    )
    totals = (await db.execute(totals_sql, params)).mappings().one()

    # Daily breakdown: strikes per day
    daily_sql = text(
        f"SELECT timestamp::date AS date, SUM(new_strikes) AS strikes "
        f"FROM lightning_events WHERE {where} "
        f"GROUP BY timestamp::date ORDER BY date"
    )
    daily_rows = (await db.execute(daily_sql, params)).mappings().all()
    daily = [{"date": str(r["date"]), "strikes": int(r["strikes"])} for r in daily_rows]

    # Hourly breakdown: strikes per hour (for charts)
    hourly_sql = text(
        f"SELECT time_bucket('1 hour', timestamp) AS bucket, "
        f"SUM(new_strikes) AS strikes, "
        f"MIN(distance_km) AS min_distance "
        f"FROM lightning_events WHERE {where} "
        f"GROUP BY bucket ORDER BY bucket"
    )
    hourly_rows = (await db.execute(hourly_sql, params)).mappings().all()
    hourly = [
        {
            "bucket": r["bucket"].isoformat(),
            "strikes": int(r["strikes"]),
            "min_distance": float(r["min_distance"]) if r["min_distance"] is not None else None,
        }
        for r in hourly_rows
    ]

    return LightningSummarySchema(
        total_strikes=int(totals["total_strikes"]),
        event_count=int(totals["event_count"]),
        filtered_count=int(filtered_count),
        closest_distance=float(totals["closest_distance"]) if totals["closest_distance"] is not None else None,
        daily=daily,
        hourly=hourly,
    )

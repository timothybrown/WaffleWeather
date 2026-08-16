"""Backfill gateway indoor readings into sensor_observations.

Fresh dev/test stacks seed weather_observations after Alembic runs, so the
migration-time copy in revision 011 can be a no-op there. This command is
idempotent and safe to run before refreshing continuous aggregates.

Invoked as:
    python -m app.maintenance.backfill_sensor_observations [--start ...] [--end ...]
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import cast

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.config import Settings

logger = logging.getLogger(__name__)

_SENSOR_KEY = "gw"
_SENSOR_LABEL = "Indoor"
_SENSOR_PLACEMENT = "indoor"

_BOUNDS_SQL = text(
    """
    SELECT MIN(timestamp), MAX(timestamp)
    FROM weather_observations
    WHERE temp_indoor IS NOT NULL OR humidity_indoor IS NOT NULL
    """
)

_UPSERT_SENSORS_SQL = text(
    """
    INSERT INTO sensors (station_id, sensor_key, label, placement, last_seen)
    SELECT
        station_id,
        :sensor_key,
        :label,
        :placement,
        MAX(timestamp) AS last_seen
    FROM weather_observations
    WHERE timestamp >= CAST(:window_start AS timestamptz)
      AND timestamp < CAST(:window_end AS timestamptz)
      AND (temp_indoor IS NOT NULL OR humidity_indoor IS NOT NULL)
    GROUP BY station_id
    ON CONFLICT (station_id, sensor_key) DO UPDATE SET
        label = COALESCE(sensors.label, EXCLUDED.label),
        placement = CASE
            WHEN sensors.placement = 'unassigned' THEN EXCLUDED.placement
            ELSE sensors.placement
        END,
        last_seen = CASE
            WHEN sensors.last_seen IS NULL THEN EXCLUDED.last_seen
            WHEN EXCLUDED.last_seen > sensors.last_seen THEN EXCLUDED.last_seen
            ELSE sensors.last_seen
        END
    """
)

_INSERT_SENSOR_OBSERVATIONS_SQL = text(
    """
    INSERT INTO sensor_observations (timestamp, station_id, sensor_key, temp, humidity)
    SELECT timestamp, station_id, :sensor_key, temp_indoor, humidity_indoor
    FROM weather_observations
    WHERE timestamp >= CAST(:window_start AS timestamptz)
      AND timestamp < CAST(:window_end AS timestamptz)
      AND (temp_indoor IS NOT NULL OR humidity_indoor IS NOT NULL)
    ON CONFLICT DO NOTHING
    """
)


def _as_utc(dt: datetime) -> datetime:
    """Return a timezone-aware UTC datetime."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    return _as_utc(datetime.fromisoformat(normalized))


def _month_start(dt: datetime) -> datetime:
    utc = _as_utc(dt)
    return utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next_month_start(dt: datetime) -> datetime:
    month_start = _month_start(dt)
    if month_start.month == 12:
        return month_start.replace(year=month_start.year + 1, month=1)
    return month_start.replace(month=month_start.month + 1)


def _range_from_bounds(min_timestamp: datetime, max_timestamp: datetime) -> tuple[datetime, datetime]:
    return _month_start(min_timestamp), _next_month_start(max_timestamp)


def backfill_windows(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """Return half-open monthly windows covering [start, end)."""
    cursor = _as_utc(start)
    final = _as_utc(end)
    if final <= cursor:
        raise ValueError(f"end ({end}) must be after start ({start})")

    windows: list[tuple[datetime, datetime]] = []
    while cursor < final:
        window_end = min(_next_month_start(cursor), final)
        windows.append((cursor, window_end))
        cursor = window_end
    return windows


async def _indoor_bounds(conn: AsyncConnection) -> tuple[datetime, datetime] | None:
    result = await conn.execute(_BOUNDS_SQL)
    row = result.one()
    min_timestamp = row[0]
    max_timestamp = row[1]
    if isinstance(min_timestamp, datetime) and isinstance(max_timestamp, datetime):
        return _range_from_bounds(min_timestamp, max_timestamp)
    return None


async def _upsert_sensors(
    conn: AsyncConnection, window_start: datetime, window_end: datetime
) -> None:
    await conn.execute(
        _UPSERT_SENSORS_SQL,
        {
            "sensor_key": _SENSOR_KEY,
            "label": _SENSOR_LABEL,
            "placement": _SENSOR_PLACEMENT,
            "window_start": window_start,
            "window_end": window_end,
        },
    )


async def _copy_sensor_observations(
    conn: AsyncConnection, window_start: datetime, window_end: datetime
) -> None:
    await conn.execute(
        _INSERT_SENSOR_OBSERVATIONS_SQL,
        {
            "sensor_key": _SENSOR_KEY,
            "window_start": window_start,
            "window_end": window_end,
        },
    )


async def _run_backfill_async(
    db_url: str, start: datetime | None = None, end: datetime | None = None
) -> None:
    engine = create_async_engine(db_url)
    try:
        async with engine.connect() as conn:
            if start is None or end is None:
                bounds = await _indoor_bounds(conn)
                if bounds is None:
                    logger.info("No indoor gateway observations found - nothing to backfill.")
                    return
                derived_start, derived_end = bounds
                window_start = _as_utc(start) if start is not None else derived_start
                window_end = _as_utc(end) if end is not None else derived_end
            else:
                window_start = _as_utc(start)
                window_end = _as_utc(end)

            windows = backfill_windows(window_start, window_end)
            await _upsert_sensors(conn, window_start, window_end)
            await conn.commit()

            for batch_start, batch_end in windows:
                logger.info("Backfilling gateway sensor rows (%s .. %s)", batch_start, batch_end)
                await _copy_sensor_observations(conn, batch_start, batch_end)
                await conn.commit()
    finally:
        await engine.dispose()


def run_backfill(
    db_url: str, start: datetime | None = None, end: datetime | None = None
) -> None:
    """Copy gateway indoor readings into sensor_observations."""
    asyncio.run(_run_backfill_async(db_url, start, end))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-url", default=None, help="defaults to WW_DATABASE_URL")
    parser.add_argument(
        "--start",
        default=None,
        help="ISO date or timestamp; defaults to earliest indoor gateway observation month",
    )
    parser.add_argument(
        "--end",
        default=None,
        help="ISO date or timestamp; defaults to the month after the latest indoor observation",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    args = _build_parser().parse_args(argv)
    db_url = cast(str | None, args.db_url) or Settings().database_url
    start_arg = cast(str | None, args.start)
    end_arg = cast(str | None, args.end)

    start = _parse_datetime(start_arg) if start_arg is not None else None
    end = _parse_datetime(end_arg) if end_arg is not None else None

    run_backfill(db_url, start, end)
    logger.info("Sensor observation backfill complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

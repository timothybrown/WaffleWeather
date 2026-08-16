"""Refresh TimescaleDB continuous aggregates outside Alembic.

refresh_continuous_aggregate() cannot execute inside a transaction block, and
alembic/env.py wraps migrations in one. This module runs the long-lived,
idempotent refresh as a separate operation.

Invoked as:
    python -m app.maintenance.refresh_aggregates [--family all] [--start ...] [--end ...]
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import logging
import sys
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import cast

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings

logger = logging.getLogger(__name__)

# Bottom-up within each family: daily reads from hourly, monthly from daily.
# Refreshing out of order leaves stale higher-level buckets.
FAMILIES: dict[str, list[str]] = {
    "observations": [
        "observations_hourly",
        "observations_daily",
        "observations_monthly",
    ],
    "sensor_observations": [
        "sensor_observations_hourly",
        "sensor_observations_daily",
        "sensor_observations_monthly",
    ],
}

_MONTHLY_EXTENSION_MONTHS = 2


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


def _add_months(dt: datetime, months: int) -> datetime:
    """Add whole months, clamping the day to the target month's length."""
    zero_based = dt.month - 1 + months
    year = dt.year + zero_based // 12
    month = zero_based % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def aggregates_for(family: str) -> list[str]:
    """Resolve a family name to its ordered aggregate list."""
    if family == "all":
        return FAMILIES["observations"] + FAMILIES["sensor_observations"]
    if family not in FAMILIES:
        expected = sorted(FAMILIES) + ["all"]
        raise ValueError(f"Unknown family {family!r}; expected one of {expected}")
    return list(FAMILIES[family])


def _floor_to_refresh_start(dt: datetime) -> datetime:
    """Floor to a bound that fully contains the month bucket holding `dt`.

    refresh_continuous_aggregate only materializes buckets *fully contained*
    in the window. Passing a raw first-observation timestamp (say
    2026-04-01 20:15) leaves both the April 1 daily bucket and the whole April
    monthly bucket partially outside the window, so TimescaleDB silently skips
    them and that history never appears.

    Flooring to the first of the month covers the monthly bucket (the coarsest
    one), and the extra day of slack covers timezone-aware bucket boundaries:
    daily and monthly buckets are cut in the station's timezone, so their start
    can be up to ~14h either side of UTC midnight.
    """
    month_start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return month_start - timedelta(days=1)


def refresh_windows(
    family: str, start: datetime, end: datetime
) -> list[tuple[str, datetime, datetime]]:
    """Return (aggregate, window_start, window_end) tuples in refresh order."""
    requested_start = _as_utc(start)
    requested_end = _as_utc(end)
    if requested_end <= requested_start:
        raise ValueError(f"end ({end}) must be after start ({start})")

    window_start = _floor_to_refresh_start(requested_start)

    windows: list[tuple[str, datetime, datetime]] = []
    for name in aggregates_for(family):
        window_end = (
            _add_months(requested_end, _MONTHLY_EXTENSION_MONTHS)
            if name.endswith("_monthly")
            else requested_end
        )
        windows.append((name, window_start, window_end))
    return windows


async def _run_refresh_async(
    db_url: str, family: str, start: datetime, end: datetime
) -> None:
    engine = create_async_engine(db_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            for name, window_start, window_end in refresh_windows(family, start, end):
                logger.info("Refreshing %s (%s .. %s)", name, window_start, window_end)
                await conn.execute(
                    text(
                        f"CALL refresh_continuous_aggregate('{name}', "
                        "CAST(:window_start AS timestamptz), "
                        "CAST(:window_end AS timestamptz))"
                    ),
                    {"window_start": window_start, "window_end": window_end},
                )
    finally:
        await engine.dispose()


def run_refresh(db_url: str, family: str, start: datetime, end: datetime) -> None:
    """Execute the refresh for every aggregate in family, in order."""
    asyncio.run(_run_refresh_async(db_url, family, start, end))


async def _earliest_observation_async(db_url: str) -> datetime | None:
    engine = create_async_engine(db_url)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT MIN(timestamp) FROM weather_observations"))
            value = result.scalar_one_or_none()
            if isinstance(value, datetime):
                return _as_utc(value)
            return None
    finally:
        await engine.dispose()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-url", default=None, help="defaults to WW_DATABASE_URL")
    parser.add_argument(
        "--family",
        default="all",
        choices=[*sorted(FAMILIES), "all"],
        help="which aggregate family to refresh",
    )
    parser.add_argument(
        "--start",
        default=None,
        help="ISO date or timestamp; defaults to earliest weather observation",
    )
    parser.add_argument("--end", default=None, help="ISO date or timestamp; defaults to now")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    args = _build_parser().parse_args(argv)
    db_url = cast(str | None, args.db_url) or Settings().database_url
    family = cast(str, args.family)
    start_arg = cast(str | None, args.start)
    end_arg = cast(str | None, args.end)

    if start_arg is not None:
        start = _parse_datetime(start_arg)
    else:
        earliest = asyncio.run(_earliest_observation_async(db_url))
        if earliest is None:
            logger.info("No observations found - nothing to refresh.")
            return 0
        start = earliest

    end = _parse_datetime(end_arg) if end_arg is not None else datetime.now(timezone.utc)

    run_refresh(db_url, family, start, end)
    logger.info("Refresh complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

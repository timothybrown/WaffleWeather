"""Station records API endpoints (all-time, yearly, monthly extremes)."""

from datetime import date
from typing import Any, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.reports import _get_station
from app.database import get_db
from app.schemas.records import (
    BrokenRecord,
    BrokenRecordsResponse,
    RecordCategory,
    RecordEntry,
    RecordMetric,
    RecordsResponse,
)

router = APIRouter(prefix="/records", tags=["records"])


# --- Metric definitions ---
# (key, label, column, agg_func, category)
# agg_func: "MAX" means we want the highest value, "MIN" means the lowest.

_DAILY_METRICS: list[tuple[str, str, str, str, str]] = [
    ("highest_temp", "Highest Temperature", "temp_outdoor_max", "MAX", "temperature"),
    ("lowest_temp", "Lowest Temperature", "temp_outdoor_min", "MIN", "temperature"),
    ("highest_dewpoint", "Highest Dewpoint", "dewpoint_max", "MAX", "temperature"),
    ("lowest_dewpoint", "Lowest Dewpoint", "dewpoint_min", "MIN", "temperature"),
    ("highest_wind_gust", "Highest Gust", "wind_gust_max", "MAX", "wind"),
    ("highest_wind_speed", "Highest Wind Speed", "wind_speed_max", "MAX", "wind"),
    ("highest_rain_daily", "Highest Daily Rainfall", "rain_daily_max", "MAX", "rain"),
    ("highest_humidity", "Highest Humidity", "humidity_outdoor_max", "MAX", "humidity"),
    ("lowest_humidity", "Lowest Humidity", "humidity_outdoor_min", "MIN", "humidity"),
    ("highest_pressure", "Highest Pressure", "pressure_rel_max", "MAX", "pressure"),
    ("lowest_pressure", "Lowest Pressure", "pressure_rel_min", "MIN", "pressure"),
    ("highest_solar_radiation", "Highest Solar Radiation", "solar_radiation_max", "MAX", "solar"),
    ("highest_uv_index", "Highest UV Index", "uv_index_max", "MAX", "solar"),
]

_CATEGORY_LABELS: dict[str, str] = {
    "temperature": "Temperature",
    "wind": "Wind",
    "rain": "Rain",
    "humidity": "Humidity",
    "pressure": "Pressure",
    "solar": "Solar",
}


# --- Query helpers ---


async def _query_record(
    db: AsyncSession,
    station_id: str,
    column: str,
    agg_func: str,
    date_filter: str | None = None,
) -> RecordEntry | None:
    """Query a single record from observations_daily.

    Returns the extreme value and the date it occurred, or None if no data.
    """
    order = "DESC" if agg_func == "MAX" else "ASC"
    where = "WHERE station_id = :station_id AND " + column + " IS NOT NULL"
    if date_filter:
        where += " AND " + date_filter

    sql = text(
        f"SELECT {column} AS value, bucket::date AS record_date "
        f"FROM observations_daily "
        f"{where} "
        f"ORDER BY {column} {order}, bucket ASC "
        f"LIMIT 1"
    )
    result = await db.execute(sql, {"station_id": station_id})
    row = result.mappings().first()
    if row is None:
        return None
    return RecordEntry(value=float(row["value"]), date=row["record_date"])


async def _query_rain_rate_record(
    db: AsyncSession,
    station_id: str,
    date_filter: str | None = None,
) -> RecordEntry | None:
    """Query the highest rain rate from the raw weather_observations table."""
    where = "WHERE station_id = :station_id AND rain_rate IS NOT NULL"
    if date_filter:
        where += " AND " + date_filter

    sql = text(
        "SELECT rain_rate AS value, timestamp::date AS record_date "
        "FROM weather_observations "
        f"{where} "
        "ORDER BY rain_rate DESC, timestamp ASC "
        "LIMIT 1"
    )
    result = await db.execute(sql, {"station_id": station_id})
    row = result.mappings().first()
    if row is None:
        return None
    return RecordEntry(value=float(row["value"]), date=row["record_date"])


async def _query_station_metadata(
    db: AsyncSession, station_id: str
) -> tuple[date | None, int]:
    """Return (earliest_date, days_of_data) from observations_daily."""
    sql = text(
        "SELECT MIN(bucket::date) AS records_since, "
        "COUNT(DISTINCT bucket::date) AS days_of_data "
        "FROM observations_daily "
        "WHERE station_id = :station_id"
    )
    result = await db.execute(sql, {"station_id": station_id})
    row = result.mappings().first()
    if row is None or row["records_since"] is None:
        return None, 0
    return row["records_since"], int(row["days_of_data"])


# --- Endpoints ---


@router.get("", response_model=RecordsResponse)
async def get_records(
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> RecordsResponse:
    """Return all station records grouped by category and time period."""
    station = await _get_station(station_id, db)
    sid = cast(str, station.id)

    today = date.today()
    first_of_month = today.replace(day=1)
    first_of_year = date(today.year, 1, 1)

    period_filters: dict[str, str | None] = {
        "this_month": f"bucket::date >= '{first_of_month.isoformat()}'",
        "this_year": f"bucket::date >= '{first_of_year.isoformat()}'",
        "all_time": None,
    }

    rain_rate_filters: dict[str, str | None] = {
        "this_month": f"timestamp::date >= '{first_of_month.isoformat()}'",
        "this_year": f"timestamp::date >= '{first_of_year.isoformat()}'",
        "all_time": None,
    }

    # Gather all metrics across periods
    metrics_by_key: dict[str, RecordMetric] = {}

    for key, label, column, agg_func, category in _DAILY_METRICS:
        period_entries: dict[str, RecordEntry | None] = {}
        for period_name, date_filter in period_filters.items():
            entry = await _query_record(db, sid, column, agg_func, date_filter)
            period_entries[period_name] = entry

        metrics_by_key[key] = RecordMetric(
            metric=key,
            label=label,
            this_month=period_entries["this_month"],
            this_year=period_entries["this_year"],
            all_time=period_entries["all_time"],
        )

    # Rain rate (from raw observations)
    rain_rate_entries: dict[str, RecordEntry | None] = {}
    for period_name, date_filter in rain_rate_filters.items():
        entry = await _query_rain_rate_record(db, sid, date_filter)
        rain_rate_entries[period_name] = entry

    metrics_by_key["highest_rain_rate"] = RecordMetric(
        metric="highest_rain_rate",
        label="Highest Rain Rate",
        this_month=rain_rate_entries["this_month"],
        this_year=rain_rate_entries["this_year"],
        all_time=rain_rate_entries["all_time"],
    )

    # Group into categories
    category_metrics: dict[str, list[RecordMetric]] = {}
    for key, _label, _col, _func, category in _DAILY_METRICS:
        category_metrics.setdefault(category, []).append(metrics_by_key[key])

    # Add rain rate to rain category
    category_metrics.setdefault("rain", []).append(metrics_by_key["highest_rain_rate"])

    categories: dict[str, RecordCategory] = {}
    for cat_key, cat_records in category_metrics.items():
        categories[cat_key] = RecordCategory(
            label=_CATEGORY_LABELS[cat_key],
            records=cat_records,
        )

    records_since, days_of_data = await _query_station_metadata(db, sid)

    return RecordsResponse(
        station_id=sid,
        records_since=records_since,
        days_of_data=days_of_data,
        categories=categories,
    )


@router.get("/broken", response_model=BrokenRecordsResponse)
async def get_broken_records(
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> BrokenRecordsResponse:
    """Return which all-time records were broken today."""
    station = await _get_station(station_id, db)
    sid = cast(str, station.id)
    today = date.today()

    broken: dict[str, BrokenRecord | None] = {}

    for key, _label, column, agg_func, _category in _DAILY_METRICS:
        broken[key] = await _check_broken_daily(
            db, sid, column, agg_func, today
        )

    # Rain rate from raw observations
    broken["highest_rain_rate"] = await _check_broken_rain_rate(db, sid, today)

    return BrokenRecordsResponse(
        station_id=sid,
        date=today,
        broken=broken,
    )


async def _check_broken_daily(
    db: AsyncSession,
    station_id: str,
    column: str,
    agg_func: str,
    today: date,
) -> BrokenRecord | None:
    """Check if today's value in observations_hourly beats the historical record.

    Historical record is from observations_daily WHERE bucket::date < today.
    Today's value comes from observations_hourly WHERE bucket::date = today.
    """
    # Get today's extreme from hourly aggregates
    if agg_func == "MAX":
        today_agg = f"MAX({column})"
    else:
        today_agg = f"MIN({column})"

    today_sql = text(
        f"SELECT {today_agg} AS value "
        f"FROM observations_hourly "
        f"WHERE station_id = :station_id "
        f"AND bucket::date = :today "
        f"AND {column} IS NOT NULL"
    )
    today_result = await db.execute(today_sql, {"station_id": station_id, "today": today})
    today_row = today_result.mappings().first()
    if today_row is None or today_row["value"] is None:
        return None

    today_value = float(today_row["value"])

    # Get historical record from daily aggregates (before today)
    order = "DESC" if agg_func == "MAX" else "ASC"
    hist_sql = text(
        f"SELECT {column} AS value, bucket::date AS record_date "
        f"FROM observations_daily "
        f"WHERE station_id = :station_id "
        f"AND bucket::date < :today "
        f"AND {column} IS NOT NULL "
        f"ORDER BY {column} {order}, bucket ASC "
        f"LIMIT 1"
    )
    hist_result = await db.execute(hist_sql, {"station_id": station_id, "today": today})
    hist_row = hist_result.mappings().first()

    if hist_row is None:
        # No historical data to compare against
        return None

    hist_value = float(hist_row["value"])
    hist_date: Any = hist_row["record_date"]

    # Check if today beats the record
    if agg_func == "MAX" and today_value > hist_value:
        return BrokenRecord(
            is_broken=True,
            current_value=today_value,
            previous_value=hist_value,
            previous_date=hist_date,
        )
    elif agg_func == "MIN" and today_value < hist_value:
        return BrokenRecord(
            is_broken=True,
            current_value=today_value,
            previous_value=hist_value,
            previous_date=hist_date,
        )

    return None


async def _check_broken_rain_rate(
    db: AsyncSession,
    station_id: str,
    today: date,
) -> BrokenRecord | None:
    """Check if today's rain rate beats the all-time record."""
    # Today's max rain rate
    today_sql = text(
        "SELECT MAX(rain_rate) AS value "
        "FROM weather_observations "
        "WHERE station_id = :station_id "
        "AND timestamp::date = :today "
        "AND rain_rate IS NOT NULL"
    )
    today_result = await db.execute(today_sql, {"station_id": station_id, "today": today})
    today_row = today_result.mappings().first()
    if today_row is None or today_row["value"] is None:
        return None

    today_value = float(today_row["value"])

    # Historical max rain rate (before today)
    hist_sql = text(
        "SELECT rain_rate AS value, timestamp::date AS record_date "
        "FROM weather_observations "
        "WHERE station_id = :station_id "
        "AND timestamp::date < :today "
        "AND rain_rate IS NOT NULL "
        "ORDER BY rain_rate DESC, timestamp ASC "
        "LIMIT 1"
    )
    hist_result = await db.execute(hist_sql, {"station_id": station_id, "today": today})
    hist_row = hist_result.mappings().first()

    if hist_row is None:
        return None

    hist_value = float(hist_row["value"])
    hist_date: Any = hist_row["record_date"]

    if today_value > hist_value:
        return BrokenRecord(
            is_broken=True,
            current_value=today_value,
            previous_value=hist_value,
            previous_date=hist_date,
        )

    return None

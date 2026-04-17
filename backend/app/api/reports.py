"""Climate report API endpoints (NOAA-style monthly/yearly reports)."""

import calendar
from collections import Counter
from datetime import date
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.station import Station
from app.schemas.climate import (
    ClimateReportSchema,
    ReportPeriodSchema,
    ReportRowSchema,
    ReportSummarySchema,
    StationInfoSchema,
)

router = APIRouter(prefix="/reports", tags=["reports"])

HDD_BASE = 18.3  # Heating degree-day base (Celsius)

_COMPASS_LABELS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


def _compass_label(degrees: float) -> str:
    """Convert wind direction in degrees to 16-point compass label."""
    sector = round(degrees / 22.5) % 16
    return _COMPASS_LABELS[sector]


def _prevailing_wind(directions: list[float]) -> str | None:
    """Return the most common compass direction from a list of degree values."""
    if not directions:
        return None
    labels = [_compass_label(d) for d in directions]
    counter = Counter(labels)
    return counter.most_common(1)[0][0]


def _hdd(temp_avg: float | None) -> float | None:
    """Heating degree-days: max(0, 18.3 - temp_avg)."""
    if temp_avg is None:
        return None
    return round(max(0.0, HDD_BASE - temp_avg), 1)


def _cdd(temp_avg: float | None) -> float | None:
    """Cooling degree-days: max(0, temp_avg - 18.3)."""
    if temp_avg is None:
        return None
    return round(max(0.0, temp_avg - HDD_BASE), 1)


# --- Unit conversion helpers for TXT output ---


def _c_to_f(c: float | None) -> float | None:
    if c is None:
        return None
    return round(c * 9.0 / 5.0 + 32.0, 1)


def _kmh_to_mph(kmh: float | None) -> float | None:
    if kmh is None:
        return None
    return round(kmh * 0.621371, 1)


def _hpa_to_inhg(hpa: float | None) -> float | None:
    if hpa is None:
        return None
    return round(hpa * 0.02953, 2)


def _mm_to_in(mm: float | None) -> float | None:
    if mm is None:
        return None
    return round(mm * 0.03937, 3)


def _fmt(val: float | None, width: int, decimals: int) -> str:
    """Right-aligned fixed-width number formatting, or spaces for None."""
    if val is None:
        return " " * width
    return f"{val:>{width}.{decimals}f}"


# --- Database helpers ---


async def _get_station(station_id: str | None, db: AsyncSession) -> Station:
    """Look up a station by ID, or return the most recently seen station."""
    if station_id:
        result = await db.execute(select(Station).where(Station.id == station_id))
    else:
        result = await db.execute(select(Station).order_by(Station.last_seen.desc()))
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


async def _query_daily_rows(
    station_id: str, start: date, end: date, db: AsyncSession
) -> list[dict[str, Any]]:
    """Query daily aggregate view for the given date range."""
    sql = text(
        "SELECT bucket::date AS day, "
        "temp_outdoor_avg, temp_outdoor_min, temp_outdoor_max, "
        "dewpoint_avg, dewpoint_min, dewpoint_max, "
        "humidity_outdoor_avg, pressure_rel_avg, "
        "wind_speed_avg, wind_gust_max, rain_daily_max "
        "FROM observations_daily "
        "WHERE station_id = :station_id AND bucket::date >= :start AND bucket::date <= :end "
        "ORDER BY day"
    )
    result = await db.execute(sql, {"station_id": station_id, "start": start, "end": end})
    return [dict(row) for row in result.mappings().all()]


async def _query_wind_directions(
    station_id: str, start: date, end: date, db: AsyncSession
) -> list[Any]:
    """Query raw wind direction observations where wind_speed > 0."""
    sql = text(
        "SELECT timestamp::date AS day, wind_dir "
        "FROM weather_observations "
        "WHERE station_id = :station_id "
        "AND timestamp::date >= :start AND timestamp::date <= :end "
        "AND wind_dir IS NOT NULL AND wind_speed > 0"
    )
    result = await db.execute(sql, {"station_id": station_id, "start": start, "end": end})
    return list(result.all())


# --- Report builders ---


def _build_station_info(station: Station) -> StationInfoSchema:
    return StationInfoSchema(
        name=station.name,
        latitude=station.latitude,
        longitude=station.longitude,
        altitude=station.altitude,
    )


def _build_monthly_report(
    station: Station,
    year: int,
    month: int,
    daily_rows: list[dict[str, Any]],
    wind_data: list[Any],
) -> ClimateReportSchema:
    """Build a monthly climate report from daily aggregates + wind data."""
    # Group wind directions by day
    wind_by_day: dict[date, list[float]] = {}
    all_wind_dirs: list[float] = []
    for day_date, wind_dir in wind_data:
        wind_by_day.setdefault(day_date, []).append(wind_dir)
        all_wind_dirs.append(wind_dir)

    rows: list[ReportRowSchema] = []
    for dr in daily_rows:
        day_date = dr["day"]
        day_winds = wind_by_day.get(day_date, [])
        rows.append(
            ReportRowSchema(
                day=day_date.day,
                temp_avg=dr.get("temp_outdoor_avg"),
                temp_max=dr.get("temp_outdoor_max"),
                temp_min=dr.get("temp_outdoor_min"),
                dewpoint_avg=dr.get("dewpoint_avg"),
                dewpoint_max=dr.get("dewpoint_max"),
                dewpoint_min=dr.get("dewpoint_min"),
                humidity_avg=dr.get("humidity_outdoor_avg"),
                pressure_avg=dr.get("pressure_rel_avg"),
                wind_speed_avg=dr.get("wind_speed_avg"),
                wind_gust_max=dr.get("wind_gust_max"),
                wind_dir_prevailing=_prevailing_wind(day_winds),
                rain_total=dr.get("rain_daily_max"),
                hdd=_hdd(dr.get("temp_outdoor_avg")),
                cdd=_cdd(dr.get("temp_outdoor_avg")),
            )
        )

    summary = _build_summary(rows, all_wind_dirs, daily_rows)

    return ClimateReportSchema(
        station=_build_station_info(station),
        period=ReportPeriodSchema(type="monthly", year=year, month=month),
        rows=rows,
        summary=summary,
    )


def _build_yearly_report(
    station: Station,
    year: int,
    daily_rows: list[dict[str, Any]],
    wind_data: list[Any],
) -> ClimateReportSchema:
    """Build a yearly climate report, grouping daily data by month."""
    # Group daily rows and wind data by month
    daily_by_month: dict[int, list[dict[str, Any]]] = {}
    wind_by_month: dict[int, list[float]] = {}
    all_wind_dirs: list[float] = []

    for dr in daily_rows:
        m = dr["day"].month
        daily_by_month.setdefault(m, []).append(dr)

    for day_date, wind_dir in wind_data:
        m = day_date.month
        wind_by_month.setdefault(m, []).append(wind_dir)
        all_wind_dirs.append(wind_dir)

    rows: list[ReportRowSchema] = []
    for month in sorted(daily_by_month.keys()):
        month_rows = daily_by_month[month]
        month_winds = wind_by_month.get(month, [])

        temps_avg = [r["temp_outdoor_avg"] for r in month_rows if r.get("temp_outdoor_avg") is not None]
        temps_max = [r["temp_outdoor_max"] for r in month_rows if r.get("temp_outdoor_max") is not None]
        temps_min = [r["temp_outdoor_min"] for r in month_rows if r.get("temp_outdoor_min") is not None]
        dewpoint_avgs = [r["dewpoint_avg"] for r in month_rows if r.get("dewpoint_avg") is not None]
        dewpoint_maxs = [r["dewpoint_max"] for r in month_rows if r.get("dewpoint_max") is not None]
        dewpoint_mins = [r["dewpoint_min"] for r in month_rows if r.get("dewpoint_min") is not None]
        humidity_avgs = [r["humidity_outdoor_avg"] for r in month_rows if r.get("humidity_outdoor_avg") is not None]
        pressure_avgs = [r["pressure_rel_avg"] for r in month_rows if r.get("pressure_rel_avg") is not None]
        wind_avgs = [r["wind_speed_avg"] for r in month_rows if r.get("wind_speed_avg") is not None]
        wind_gusts = [r["wind_gust_max"] for r in month_rows if r.get("wind_gust_max") is not None]
        rain_totals = [r["rain_daily_max"] for r in month_rows if r.get("rain_daily_max") is not None]

        month_avg_temp = round(sum(temps_avg) / len(temps_avg), 1) if temps_avg else None

        rows.append(
            ReportRowSchema(
                month=month,
                temp_avg=month_avg_temp,
                temp_max=round(max(temps_max), 1) if temps_max else None,
                temp_min=round(min(temps_min), 1) if temps_min else None,
                dewpoint_avg=round(sum(dewpoint_avgs) / len(dewpoint_avgs), 1) if dewpoint_avgs else None,
                dewpoint_max=round(max(dewpoint_maxs), 1) if dewpoint_maxs else None,
                dewpoint_min=round(min(dewpoint_mins), 1) if dewpoint_mins else None,
                humidity_avg=round(sum(humidity_avgs) / len(humidity_avgs), 1) if humidity_avgs else None,
                pressure_avg=round(sum(pressure_avgs) / len(pressure_avgs), 1) if pressure_avgs else None,
                wind_speed_avg=round(sum(wind_avgs) / len(wind_avgs), 1) if wind_avgs else None,
                wind_gust_max=round(max(wind_gusts), 1) if wind_gusts else None,
                wind_dir_prevailing=_prevailing_wind(month_winds),
                rain_total=round(sum(rain_totals), 1) if rain_totals else None,
                hdd=_hdd(month_avg_temp),
                cdd=_cdd(month_avg_temp),
            )
        )

    summary = _build_summary(rows, all_wind_dirs, daily_rows)

    return ClimateReportSchema(
        station=_build_station_info(station),
        period=ReportPeriodSchema(type="yearly", year=year),
        rows=rows,
        summary=summary,
    )


def _build_summary(
    rows: list[ReportRowSchema],
    all_wind_dirs: list[float],
    daily_rows: list[dict[str, Any]],
) -> ReportSummarySchema:
    """Build report summary with extremes, totals, and dates."""
    temps_avg = [r.temp_avg for r in rows if r.temp_avg is not None]
    rain_totals = [r.rain_total for r in rows if r.rain_total is not None]
    hdd_vals = [r.hdd for r in rows if r.hdd is not None]
    cdd_vals = [r.cdd for r in rows if r.cdd is not None]

    # Find extremes with dates from daily_rows
    temp_max_val = None
    temp_max_date = None
    temp_min_val = None
    temp_min_date = None
    wind_gust_max_val = None
    wind_gust_max_date = None

    for dr in daily_rows:
        t_max = dr.get("temp_outdoor_max")
        if t_max is not None and (temp_max_val is None or t_max > temp_max_val):
            temp_max_val = t_max
            temp_max_date = str(dr["day"])

        t_min = dr.get("temp_outdoor_min")
        if t_min is not None and (temp_min_val is None or t_min < temp_min_val):
            temp_min_val = t_min
            temp_min_date = str(dr["day"])

        w_gust = dr.get("wind_gust_max")
        if w_gust is not None and (wind_gust_max_val is None or w_gust > wind_gust_max_val):
            wind_gust_max_val = w_gust
            wind_gust_max_date = str(dr["day"])

    rain_days = sum(1 for r in rows if r.rain_total is not None and r.rain_total > 0)

    return ReportSummarySchema(
        temp_avg=round(sum(temps_avg) / len(temps_avg), 1) if temps_avg else None,
        temp_max=temp_max_val,
        temp_max_date=temp_max_date,
        temp_min=temp_min_val,
        temp_min_date=temp_min_date,
        rain_total=round(sum(rain_totals), 1) if rain_totals else None,
        rain_days=rain_days,
        wind_gust_max=wind_gust_max_val,
        wind_gust_max_date=wind_gust_max_date,
        wind_dir_prevailing=_prevailing_wind(all_wind_dirs),
        hdd_total=round(sum(hdd_vals), 1) if hdd_vals else None,
        cdd_total=round(sum(cdd_vals), 1) if cdd_vals else None,
    )


# --- TXT formatter ---


def format_report_txt(report: ClimateReportSchema, units: str = "metric") -> str:
    """Format a climate report as fixed-width NOAA-style text."""
    imperial = units == "imperial"

    temp_unit = "F" if imperial else "C"
    wind_unit = "mph" if imperial else "km/h"
    pres_unit = "inHg" if imperial else "hPa"
    rain_unit = "in" if imperial else "mm"

    lines: list[str] = []

    # Title
    period = report.period
    if period.type == "monthly" and period.month:
        title = f"CLIMATE REPORT — {calendar.month_name[period.month].upper()} {period.year}"
    else:
        title = f"CLIMATE REPORT — {period.year}"

    lines.append(title)
    lines.append(f"Station: {report.station.name or 'Unknown'}")
    if report.station.latitude is not None and report.station.longitude is not None:
        lines.append(
            f"Location: {report.station.latitude:.4f}N, "
            f"{abs(report.station.longitude):.4f}{'W' if report.station.longitude < 0 else 'E'}"
        )
    if report.station.altitude is not None:
        lines.append(f"Altitude: {report.station.altitude:.0f} m")
    lines.append("")

    # Column label
    day_col = "Day" if period.type == "monthly" else "Mon"

    header = (
        f"{day_col:>3}  "
        f"{'TAvg':>6}  {'TMax':>6}  {'TMin':>6}  "
        f"{'DpAv':>6}  "
        f"{'HAvg':>5}  {'Press':>7}  "
        f"{'WSpd':>5}  {'WGst':>5}  {'WDir':>4}  "
        f"{'Rain':>7}  {'HDD':>5}  {'CDD':>5}"
    )
    lines.append(header)

    unit_row = (
        f"{'':>3}  "
        f"{'(' + temp_unit + ')':>6}  {'(' + temp_unit + ')':>6}  {'(' + temp_unit + ')':>6}  "
        f"{'(' + temp_unit + ')':>6}  "
        f"{'(%)':>5}  {'(' + pres_unit + ')':>7}  "
        f"{'(' + wind_unit + ')':>5}  {'(' + wind_unit + ')':>5}  {'':>4}  "
        f"{'(' + rain_unit + ')':>7}  {'':>5}  {'':>5}"
    )
    lines.append(unit_row)
    lines.append("-" * len(header))

    def _conv_temp(v: float | None) -> float | None:
        return _c_to_f(v) if imperial else v

    def _conv_wind(v: float | None) -> float | None:
        return _kmh_to_mph(v) if imperial else v

    def _conv_pres(v: float | None) -> float | None:
        return _hpa_to_inhg(v) if imperial else v

    def _conv_rain(v: float | None) -> float | None:
        return _mm_to_in(v) if imperial else v

    for row in report.rows:
        day_val = row.day if period.type == "monthly" else row.month
        line = (
            f"{day_val or '':>3}  "
            f"{_fmt(_conv_temp(row.temp_avg), 6, 1)}  "
            f"{_fmt(_conv_temp(row.temp_max), 6, 1)}  "
            f"{_fmt(_conv_temp(row.temp_min), 6, 1)}  "
            f"{_fmt(_conv_temp(row.dewpoint_avg), 6, 1)}  "
            f"{_fmt(row.humidity_avg, 5, 0)}  "
            f"{_fmt(_conv_pres(row.pressure_avg), 7, 2)}  "
            f"{_fmt(_conv_wind(row.wind_speed_avg), 5, 1)}  "
            f"{_fmt(_conv_wind(row.wind_gust_max), 5, 1)}  "
            f"{row.wind_dir_prevailing or '':>4}  "
            f"{_fmt(_conv_rain(row.rain_total), 7, 1 if not imperial else 3)}  "
            f"{_fmt(row.hdd, 5, 1)}  "
            f"{_fmt(row.cdd, 5, 1)}"
        )
        lines.append(line)

    lines.append("-" * len(header))

    # Summary
    s = report.summary
    lines.append("")
    lines.append("SUMMARY")
    lines.append(
        f"  Avg Temp: {_fmt(_conv_temp(s.temp_avg), 6, 1)} {temp_unit}"
    )
    lines.append(
        f"  Max Temp: {_fmt(_conv_temp(s.temp_max), 6, 1)} {temp_unit}  ({s.temp_max_date or ''})"
    )
    lines.append(
        f"  Min Temp: {_fmt(_conv_temp(s.temp_min), 6, 1)} {temp_unit}  ({s.temp_min_date or ''})"
    )
    lines.append(
        f"  Rain Total: {_fmt(_conv_rain(s.rain_total), 7, 1 if not imperial else 3)} {rain_unit}"
        f"  ({s.rain_days} rain days)"
    )
    lines.append(
        f"  Max Gust: {_fmt(_conv_wind(s.wind_gust_max), 5, 1)} {wind_unit}"
        f"  ({s.wind_gust_max_date or ''})"
    )
    lines.append(f"  Prevailing Wind: {s.wind_dir_prevailing or 'N/A'}")
    lines.append(f"  HDD Total: {_fmt(s.hdd_total, 6, 1)}   CDD Total: {_fmt(s.cdd_total, 6, 1)}")
    lines.append("")

    return "\n".join(lines)


# --- Endpoints ---


@router.get("/monthly", response_model=ClimateReportSchema)
async def get_monthly_report(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ClimateReportSchema:
    """Generate a monthly climate report with daily rows."""
    station = await _get_station(station_id, db)
    _, last_day = calendar.monthrange(year, month)
    start = date(year, month, 1)
    end = date(year, month, last_day)

    sid = cast(str, station.id)
    daily_rows = await _query_daily_rows(sid, start, end, db)
    wind_data = await _query_wind_directions(sid, start, end, db)

    return _build_monthly_report(station, year, month, daily_rows, wind_data)


@router.get("/yearly", response_model=ClimateReportSchema)
async def get_yearly_report(
    year: int = Query(..., ge=2000, le=2100),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ClimateReportSchema:
    """Generate a yearly climate report with monthly rows."""
    station = await _get_station(station_id, db)
    start = date(year, 1, 1)
    end = date(year, 12, 31)

    sid = cast(str, station.id)
    daily_rows = await _query_daily_rows(sid, start, end, db)
    wind_data = await _query_wind_directions(sid, start, end, db)

    return _build_yearly_report(station, year, daily_rows, wind_data)


@router.get("/monthly/txt", response_class=PlainTextResponse)
async def get_monthly_report_txt(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    units: str = Query("metric", pattern="^(metric|imperial)$"),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> PlainTextResponse:
    """Generate a monthly climate report as fixed-width text."""
    station = await _get_station(station_id, db)
    _, last_day = calendar.monthrange(year, month)
    start = date(year, month, 1)
    end = date(year, month, last_day)

    sid = cast(str, station.id)
    daily_rows = await _query_daily_rows(sid, start, end, db)
    wind_data = await _query_wind_directions(sid, start, end, db)

    report = _build_monthly_report(station, year, month, daily_rows, wind_data)
    return PlainTextResponse(
        content=format_report_txt(report, units),
        headers={"Content-Disposition": f'attachment; filename="NOAA-{year}-{month:02d}.txt"'},
    )


@router.get("/yearly/txt", response_class=PlainTextResponse)
async def get_yearly_report_txt(
    year: int = Query(..., ge=2000, le=2100),
    units: str = Query("metric", pattern="^(metric|imperial)$"),
    station_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> PlainTextResponse:
    """Generate a yearly climate report as fixed-width text."""
    station = await _get_station(station_id, db)
    start = date(year, 1, 1)
    end = date(year, 12, 31)

    sid = cast(str, station.id)
    daily_rows = await _query_daily_rows(sid, start, end, db)
    wind_data = await _query_wind_directions(sid, start, end, db)

    report = _build_yearly_report(station, year, daily_rows, wind_data)
    return PlainTextResponse(
        content=format_report_txt(report, units),
        headers={"Content-Disposition": f'attachment; filename="NOAA-{year}.txt"'},
    )

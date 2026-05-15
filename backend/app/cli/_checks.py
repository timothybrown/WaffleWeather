"""Diagnostic checks shared by status, doctor, and update.

Each check returns a `Check` dataclass with a name, severity, and detail
string. Checks never log — they return data, and the calling command
formats and emits.
"""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.cli._format import Severity
from app.cli._systemd import get_nrestarts, is_active

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


@dataclass
class Check:
    name: str
    severity: Severity
    detail: str
    age_seconds: float | None = None


ENV_REQUIRED: tuple[str, ...] = ("WW_DATABASE_URL",)
ENV_RECOMMENDED: tuple[str, ...] = (
    "WW_STATION_NAME",
    "WW_STATION_LATITUDE",
    "WW_STATION_LONGITUDE",
)


# Field groups for doctor's per-sensor freshness checks.
# Each entry: (group label, columns that must have non-null values).
FIELD_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Outdoor T/H", ("temp_outdoor", "humidity_outdoor")),
    ("Indoor T/H", ("temp_indoor", "humidity_indoor")),
    ("Pressure", ("pressure_rel", "pressure_abs")),
    ("Wind", ("wind_speed", "wind_gust", "wind_dir")),
    ("Rain", ("rain_daily", "rain_rate")),
    ("Solar/UV", ("solar_radiation", "uv_index")),
    ("Lightning sensor", ("lightning_count",)),
    ("Air quality", ("pm25", "pm10")),
    ("Soil moisture", ("soil_moisture_1", "soil_moisture_2")),
    ("Specialty channels", ("co2", "bgt", "wbgt", "vpd")),
)

# Always-reporting groups (every observation should populate these)
ALWAYS_GROUPS: frozenset[str] = frozenset(
    {"Outdoor T/H", "Indoor T/H", "Pressure", "Wind", "Rain", "Solar/UV", "Lightning sensor"}
)


# ---------------------------------------------------------------------------
# Disk
# ---------------------------------------------------------------------------


def disk_free_percent(path: str = "/") -> float:
    usage = shutil.disk_usage(path)
    return 100.0 * usage.free / usage.total


def free_disk_check(threshold_percent: float = 10.0, path: str = "/") -> Check:
    pct = disk_free_percent(path)
    severity = Severity.OK if pct >= threshold_percent else Severity.FAIL
    return Check(
        name="Free disk",
        severity=severity,
        detail=f"{pct:.1f}% free on {path}",
    )


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------


def audit_env_keys(
    settings: Any,
    *,
    ecowitt_enabled: bool,
    mqtt_broker_explicit: bool = False,
) -> list[Check]:
    """Audit env vars by reading from a Settings instance.

    `ecowitt_enabled` is True when systemctl is-enabled ecowitt2mqtt returns 0.
    `mqtt_broker_explicit` is True when the .env explicitly sets WW_MQTT_BROKER
    (vs. relying on the default 'localhost').
    """
    results: list[Check] = []

    # Required
    db_present = bool(getattr(settings, "database_url", "") or "")
    results.append(
        Check(
            name="WW_DATABASE_URL",
            severity=Severity.OK if db_present else Severity.FAIL,
            detail="set" if db_present else "missing — required",
        )
    )

    # Recommended (station metadata)
    for env_name, attr in (
        ("WW_STATION_NAME", "station_name"),
        ("WW_STATION_LATITUDE", "station_latitude"),
        ("WW_STATION_LONGITUDE", "station_longitude"),
    ):
        value = getattr(settings, attr, None)
        present = value is not None and value != ""
        results.append(
            Check(
                name=env_name,
                severity=Severity.OK if present else Severity.WARN,
                detail="set" if present else "unset — recommended for solar/geometry features",
            )
        )

    # Conditional: WW_MQTT_BROKER
    # Warning when ecowitt2mqtt.service is enabled AND no explicit value was provided.
    if ecowitt_enabled and not mqtt_broker_explicit:
        results.append(
            Check(
                name="WW_MQTT_BROKER",
                severity=Severity.WARN,
                detail="unset but ecowitt2mqtt.service is enabled (unit substitutes ${WW_MQTT_BROKER} literally)",
            )
        )
    else:
        results.append(
            Check(
                name="WW_MQTT_BROKER",
                severity=Severity.OK,
                detail=getattr(settings, "mqtt_broker", "localhost"),
            )
        )

    return results


# ---------------------------------------------------------------------------
# Freshness
# ---------------------------------------------------------------------------


def field_freshness(
    name: str,
    max_age_seconds: float | None,
    warn_after: float = 300.0,
    fail_after: float = 1800.0,
) -> Check:
    """Render a freshness check.

    `max_age_seconds=None` means the column has always been NULL — interpret
    as "sensor not installed" and report OK with that detail (excluded from
    fail tallies by callers via the dedicated `installed` flag implicitly
    encoded in the detail).
    """
    if max_age_seconds is None:
        return Check(name=name, severity=Severity.OK, detail="not installed")
    if max_age_seconds <= warn_after:
        severity = Severity.OK
    elif max_age_seconds <= fail_after:
        severity = Severity.WARN
    else:
        severity = Severity.FAIL
    return Check(
        name=name,
        severity=severity,
        detail=f"latest: {int(max_age_seconds)}s ago",
        age_seconds=max_age_seconds,
    )


# ---------------------------------------------------------------------------
# Postgres
# ---------------------------------------------------------------------------


async def pg_reachable(database_url: str, timeout: float = 5.0) -> Check:
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return Check(name="Postgres reachable", severity=Severity.OK, detail="SELECT 1 OK")
    except Exception as exc:
        return Check(
            name="Postgres reachable",
            severity=Severity.FAIL,
            detail=f"{type(exc).__name__}: {exc}",
        )
    finally:
        await engine.dispose()


async def schema_present(database_url: str) -> Check:
    """Verify weather_observations table exists. Sufficient signal that migrations have run."""
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1 FROM weather_observations LIMIT 1"))
        return Check(name="Schema present", severity=Severity.OK, detail="weather_observations exists")
    except Exception as exc:
        return Check(
            name="Schema present",
            severity=Severity.FAIL,
            detail=f"weather_observations not queryable: {type(exc).__name__}",
        )
    finally:
        await engine.dispose()


async def latest_observation_age(database_url: str) -> float | None:
    """Seconds since the latest weather_observations row, or None if empty/error."""
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT MAX(timestamp) FROM weather_observations"))
            row = result.first()
            if row is None or row[0] is None:
                return None
            latest: datetime = row[0]
            if latest.tzinfo is None:
                latest = latest.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - latest).total_seconds()
    except Exception:
        return None
    finally:
        await engine.dispose()


async def column_max_age(database_url: str, column: str) -> float | None:
    """Return seconds since the most recent non-null value in `column`, or None if always NULL.

    `column` is interpolated into the SQL via column-name allowlisting in the
    caller — never pass user input here.
    """
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as conn:
            sql = text(
                f"SELECT MAX(timestamp) FROM weather_observations WHERE {column} IS NOT NULL"  # noqa: S608
            )
            result = await conn.execute(sql)
            row = result.first()
            if row is None or row[0] is None:
                return None
            latest: datetime = row[0]
            if latest.tzinfo is None:
                latest = latest.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - latest).total_seconds()
    except Exception:
        return None
    finally:
        await engine.dispose()


async def stations_last_seen(database_url: str) -> dict[str, float | None]:
    """Return a mapping of station_id -> seconds since last_seen (None if never seen)."""
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT id, last_seen FROM stations"))
            now = datetime.now(timezone.utc)
            out: dict[str, float | None] = {}
            for row in result:
                station_id, last_seen = row
                if last_seen is None:
                    out[station_id] = None
                else:
                    if last_seen.tzinfo is None:
                        last_seen = last_seen.replace(tzinfo=timezone.utc)
                    out[station_id] = (now - last_seen).total_seconds()
            return out
    except Exception:
        return {}
    finally:
        await engine.dispose()


async def lightning_events_summary(database_url: str) -> dict[str, Any]:
    """Latest event, last-24h count, last-7d count. Always returns a dict (empty on error)."""
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as conn:
            row24 = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM lightning_events "
                    "WHERE timestamp >= NOW() - INTERVAL '24 hours'"
                )
            )
            row7d = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM lightning_events "
                    "WHERE timestamp >= NOW() - INTERVAL '7 days'"
                )
            )
            latest = await conn.execute(text("SELECT MAX(timestamp) FROM lightning_events"))
            count_24h = row24.scalar() or 0
            count_7d = row7d.scalar() or 0
            latest_ts = latest.scalar()
            return {"latest": latest_ts, "count_24h": count_24h, "count_7d": count_7d}
    except Exception:
        return {}
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Alembic
# ---------------------------------------------------------------------------


def alembic_current_vs_heads(backend_dir: Path) -> Check:
    """Compare `alembic current` against `alembic heads`. Both as the service user is overkill for read-only inspect."""
    try:
        current = subprocess.run(
            [str(backend_dir / ".venv/bin/alembic"), "current"],
            capture_output=True,
            timeout=10,
            cwd=str(backend_dir),
        )
        heads = subprocess.run(
            [str(backend_dir / ".venv/bin/alembic"), "heads"],
            capture_output=True,
            timeout=10,
            cwd=str(backend_dir),
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        return Check(
            name="Schema migrations",
            severity=Severity.FAIL,
            detail=f"alembic invocation failed: {type(exc).__name__}",
        )
    if current.returncode != 0 or heads.returncode != 0:
        return Check(
            name="Schema migrations",
            severity=Severity.FAIL,
            detail="alembic returned non-zero",
        )
    cur_rev = current.stdout.decode(errors="replace").strip().split("\n")[0].split(" ")[0]
    head_rev = heads.stdout.decode(errors="replace").strip().split("\n")[0].split(" ")[0]
    if cur_rev == head_rev and cur_rev:
        return Check(
            name="Schema migrations",
            severity=Severity.OK,
            detail=f"current = heads = {cur_rev[:8]}",
        )
    return Check(
        name="Schema migrations",
        severity=Severity.FAIL,
        detail=f"current={cur_rev[:8] or 'none'} heads={head_rev[:8] or 'none'}",
    )


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def backend_http_version(
    api_key: str | None,
    url: str = "http://127.0.0.1:8000/api/v1/version",
    timeout: float = 5.0,
) -> str | None:
    """GET /api/v1/version; return the version string, or None on any failure."""
    req = urllib.request.Request(url)
    if api_key:
        req.add_header("X-API-Key", api_key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            data = json.loads(resp.read())
    except (urllib.error.URLError, socket.timeout, json.JSONDecodeError, OSError):
        return None
    version = data.get("version") if isinstance(data, dict) else None
    if isinstance(version, str):
        return version
    return None


def backend_http_check(api_key: str | None) -> Check:
    """Doctor's HTTP responsiveness check."""
    version = backend_http_version(api_key)
    if version:
        return Check(
            name="Backend HTTP",
            severity=Severity.OK,
            detail=f"/api/v1/version → {version}",
        )
    return Check(
        name="Backend HTTP",
        severity=Severity.FAIL,
        detail="/api/v1/version unreachable or returned an invalid body",
    )


# ---------------------------------------------------------------------------
# systemd
# ---------------------------------------------------------------------------


def systemd_unit_check(unit: str) -> Check:
    if is_active(unit):
        return Check(name=unit, severity=Severity.OK, detail="active")
    return Check(name=unit, severity=Severity.FAIL, detail="inactive or unknown")


def nrestarts_check(unit: str, threshold: int = 3) -> Check:
    n = get_nrestarts(unit)
    if n <= threshold:
        return Check(name=f"{unit} NRestarts", severity=Severity.OK, detail=f"{n}")
    return Check(
        name=f"{unit} NRestarts",
        severity=Severity.WARN,
        detail=f"{n} (cumulative since boot or last reset-failed)",
    )

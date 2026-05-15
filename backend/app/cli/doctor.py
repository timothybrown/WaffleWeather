"""`waffleweather doctor` — comprehensive diagnostic with warn-level checks."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import click
from rich.console import Console

from app.cli._checks import (
    ALWAYS_GROUPS,
    Check,
    FIELD_GROUPS,
    alembic_current_vs_heads,
    audit_env_keys,
    backend_http_check,
    column_max_age,
    field_freshness,
    free_disk_check,
    latest_observation_age,
    lightning_events_summary,
    nrestarts_check,
    pg_reachable,
    schema_present,
    stations_last_seen,
    systemd_unit_check,
)
from app.cli._format import Severity, badge, make_check_table, summary_line
from app.cli._settings import load_settings
from app.cli._state import read_state
from app.cli._systemd import MANAGED_UNITS, is_enabled
from app.config import Settings


def _mqtt_broker_was_explicit(env_path: Path | None) -> bool:
    """Inspect the .env file to see if WW_MQTT_BROKER was set explicitly."""
    candidates: list[Path] = []
    if env_path:
        candidates.append(env_path)
    candidates.append(Path("/opt/waffleweather/.env"))
    for p in candidates:
        if not p.exists():
            continue
        try:
            text = p.read_text()
        except OSError:
            continue
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("WW_MQTT_BROKER="):
                return True
    return False


def _group_check(database_url: str, label: str, columns: tuple[str, ...]) -> Check:
    """Combine multiple column ages and produce one Check for the group."""
    warn_after = 300.0 if label in ALWAYS_GROUPS else 1800.0
    fail_after = 1800.0 if label in ALWAYS_GROUPS else 86400.0
    ages: list[float | None] = []
    for col in columns:
        ages.append(asyncio.run(column_max_age(database_url, col)))
    # If every column is always-null, the sensor isn't installed.
    if all(a is None for a in ages):
        return field_freshness(label, max_age_seconds=None)
    best = min((a for a in ages if a is not None), default=None)
    return field_freshness(label, max_age_seconds=best, warn_after=warn_after, fail_after=fail_after)


def collect_doctor_checks(settings: Settings, env_path: Path | None = None) -> list[Check]:
    checks: list[Check] = []

    # systemd
    for unit in MANAGED_UNITS:
        checks.append(systemd_unit_check(unit))
        checks.append(nrestarts_check(unit))

    # Postgres / schema
    pg_check = asyncio.run(pg_reachable(settings.database_url))
    checks.append(pg_check)
    if pg_check.severity == Severity.OK:
        checks.append(asyncio.run(schema_present(settings.database_url)))
        checks.append(alembic_current_vs_heads(Path("/opt/waffleweather/backend")))
        # Database freshness
        age = asyncio.run(latest_observation_age(settings.database_url))
        if age is None:
            checks.append(Check("Database freshness", Severity.WARN, "no observations yet"))
        else:
            checks.append(field_freshness("Database freshness", age, warn_after=300, fail_after=1800))
        # Per-station last_seen
        for sid, station_age in asyncio.run(stations_last_seen(settings.database_url)).items():
            if station_age is None:
                checks.append(Check(f"Station {sid}", Severity.WARN, "never seen"))
            else:
                checks.append(field_freshness(f"Station {sid}", station_age, warn_after=300, fail_after=1800))
        # Field-group freshness
        for label, cols in FIELD_GROUPS:
            checks.append(_group_check(settings.database_url, label, cols))
        # Lightning events (info-only — never affects exit code)
        summary = asyncio.run(lightning_events_summary(settings.database_url))
        if summary:
            detail = f"24h: {summary.get('count_24h', 0)}, 7d: {summary.get('count_7d', 0)}"
            checks.append(Check("Lightning events", Severity.OK, detail))

    # Backend HTTP
    checks.append(backend_http_check(settings.api_key))

    # Env audit
    ecowitt_enabled = is_enabled("ecowitt2mqtt")
    mqtt_explicit = _mqtt_broker_was_explicit(env_path)
    checks.extend(audit_env_keys(settings, ecowitt_enabled=ecowitt_enabled, mqtt_broker_explicit=mqtt_explicit))

    # Disk
    checks.append(free_disk_check())

    # Last update attempt
    state = read_state()
    if state is not None and state.phase.value != "complete":
        checks.append(
            Check(
                "Last update attempt",
                Severity.WARN,
                f"failed at phase={state.phase.value} on {state.updated_at}",
            )
        )

    return checks


@click.command("doctor")
@click.pass_context
def doctor_cmd(ctx: click.Context) -> None:
    """Comprehensive diagnostic — paste-friendly with `--json`."""
    json_output = ctx.obj.get("json", False)
    config_path = ctx.obj.get("config_path")

    try:
        settings = load_settings(env_path=config_path)
    except Exception as exc:
        msg = f"✗ doctor could not run: {exc}"
        if json_output:
            sys.stdout.write(json.dumps({"error": str(exc)}) + "\n")
        else:
            click.echo(msg, err=True)
        ctx.exit(2)
        return

    try:
        checks = collect_doctor_checks(settings, env_path=config_path)
    except Exception as exc:
        if json_output:
            sys.stdout.write(json.dumps({"error": f"doctor crashed: {exc}"}) + "\n")
        else:
            click.echo(f"✗ doctor crashed: {exc}", err=True)
        ctx.exit(2)
        return

    issues = [c for c in checks if c.severity != Severity.OK]

    if json_output:
        payload = {
            c.name: {
                "status": c.severity.value,
                "detail": c.detail,
                "age_seconds": c.age_seconds,
            }
            for c in checks
        }
        sys.stdout.write(json.dumps(payload, default=str) + "\n")
        if issues:
            ctx.exit(1)
        return

    console = ctx.obj.get("console") or Console()
    passed = len(checks) - len(issues)
    console.print(summary_line(passed, len(checks)))
    table = make_check_table("Doctor")
    for c in checks:
        table.add_row(c.name, badge(c.severity), c.detail)
    console.print(table)

    if issues:
        ctx.exit(1)

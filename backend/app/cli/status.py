"""`waffleweather status` — binary diagnostic check for cron/scripts."""

from __future__ import annotations

import asyncio
import json
import sys
from importlib.metadata import PackageNotFoundError, version as pkg_version

import click
from rich.console import Console

from app.cli._checks import (
    Check,
    backend_http_check,
    free_disk_check,
    pg_reachable,
    schema_present,
    systemd_unit_check,
)
from app.cli._format import Severity, badge, make_check_table, summary_line
from app.cli._settings import load_settings
from app.cli._systemd import MANAGED_UNITS
from app.config import Settings


def collect_status_checks(settings: Settings) -> list[Check]:
    """Run all binary checks synchronously, return as a list.

    Wraps async DB checks in asyncio.run. Each command opens and disposes its
    own engine so there's no shared state across invocations.
    """
    checks: list[Check] = []
    # systemd units
    for unit in MANAGED_UNITS:
        checks.append(systemd_unit_check(unit))
    # Postgres reachability + schema
    if settings.database_url:
        checks.append(asyncio.run(pg_reachable(settings.database_url)))
        checks.append(asyncio.run(schema_present(settings.database_url)))
    else:
        checks.append(Check("Postgres reachable", Severity.FAIL, "WW_DATABASE_URL not set"))
    # Backend HTTP
    checks.append(backend_http_check(settings.api_key))
    # Disk
    checks.append(free_disk_check())
    # Version cross-check: running must match installed.
    try:
        from app.cli._checks import backend_http_version

        installed = pkg_version("waffleweather-backend")
        running = backend_http_version(api_key=settings.api_key)
        if running is None:
            checks.append(
                Check(
                    "Backend version",
                    Severity.FAIL,
                    f"installed {installed}, running n/a (service unreachable)",
                )
            )
        elif running == installed:
            checks.append(
                Check(
                    "Backend version",
                    Severity.OK,
                    f"{installed} (running matches installed)",
                )
            )
        else:
            checks.append(
                Check(
                    "Backend version",
                    Severity.FAIL,
                    f"installed {installed} ≠ running {running} "
                    "(restart backend to pick up new code)",
                )
            )
    except PackageNotFoundError:
        checks.append(Check("Backend version", Severity.FAIL, "package not found"))
    return checks


@click.command("status")
@click.pass_context
def status_cmd(ctx: click.Context) -> None:
    """Show whether managed services and core checks are healthy."""
    json_output = ctx.obj.get("json", False)
    config_path = ctx.obj.get("config_path")

    try:
        settings = load_settings(env_path=config_path)
    except Exception as exc:
        if json_output:
            sys.stdout.write(json.dumps({"error": str(exc)}) + "\n")
        else:
            click.echo(f"✗ Could not load settings: {exc}", err=True)
        ctx.exit(2)
        return

    checks = collect_status_checks(settings)

    if json_output:
        payload = {c.name: {"status": c.severity.value, "detail": c.detail} for c in checks}
        sys.stdout.write(json.dumps(payload) + "\n")
        if any(c.severity != Severity.OK for c in checks):
            ctx.exit(1)
        return

    console = ctx.obj.get("console") or Console()
    passed = sum(1 for c in checks if c.severity == Severity.OK)
    console.print(summary_line(passed, len(checks)))
    table = make_check_table("Status")
    for c in checks:
        table.add_row(c.name, badge(c.severity), c.detail)
    console.print(table)
    if passed < len(checks):
        ctx.exit(1)

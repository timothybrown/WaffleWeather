"""`waffleweather version` — show installed vs running backend version."""

from __future__ import annotations

import json
import sys
from importlib.metadata import PackageNotFoundError, version as pkg_version

import click

from app.cli._checks import backend_http_version
from app.cli._settings import load_settings


def installed_version() -> str | None:
    """Return the installed waffleweather-backend wheel version, or None on lookup failure."""
    try:
        return pkg_version("waffleweather-backend")
    except PackageNotFoundError:
        return None


def running_version(api_key: str | None = None) -> str | None:
    """Return the version reported by GET /api/v1/version, or None on any failure."""
    return backend_http_version(api_key=api_key)


@click.command("version")
@click.pass_context
def version_cmd(ctx: click.Context) -> None:
    """Show installed and running backend versions."""
    json_output = ctx.obj.get("json", False)
    config_path = ctx.obj.get("config_path")

    try:
        settings = load_settings(env_path=config_path)
        api_key = settings.api_key
    except Exception:
        api_key = None

    installed = installed_version()
    running = running_version(api_key=api_key)

    match = bool(installed and running and installed == running)

    if json_output:
        sys.stdout.write(
            json.dumps(
                {
                    "backend_installed": installed,
                    "backend_running": running,
                    "match": match,
                }
            )
            + "\n"
        )
        if not match:
            ctx.exit(1)
        return

    click.echo(f"Backend (installed):  {installed or 'unknown'}")
    if running is None:
        click.echo("Backend (running):    n/a (backend service unavailable)")
        ctx.exit(1)
    elif match:
        click.echo(f"Backend (running):    {running}  (matches)")
    else:
        click.echo(f"Backend (running):    {running}  (MISMATCH)")
        ctx.exit(1)

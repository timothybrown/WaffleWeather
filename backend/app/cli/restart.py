"""`waffleweather restart [SERVICE ...]` — bounce systemd units via sudo."""

from __future__ import annotations

import subprocess
import time

import click
from rich.console import Console
from rich.table import Table

from app.cli._privilege import has_sudo_for, is_root
from app.cli._systemd import (
    DEFAULT_RESTART_UNITS,
    SYSTEMCTL,
    is_active,
    resolve_unit,
    systemctl_restart_cmd,
)


@click.command("restart")
@click.argument("services", nargs=-1)
@click.pass_context
def restart_cmd(ctx: click.Context, services: tuple[str, ...]) -> None:
    """Restart one or more managed units. Default: backend + frontend + ecowitt2mqtt."""
    units: tuple[str, ...] = (
        tuple(resolve_unit(s) for s in services) if services else DEFAULT_RESTART_UNITS
    )

    # Privilege check: either we're already root, or sudoers grants us the
    # restart for EVERY requested unit. Checking only the first would let a
    # mismatch in sudoers (e.g. backend granted, frontend not) fail mid-batch
    # with a confusing systemctl error.
    if not is_root():
        missing = [u for u in units if not has_sudo_for([SYSTEMCTL, "restart", u])]
        if missing:
            click.echo(
                f"This command needs sudo for: {', '.join(missing)}. "
                f"Run: sudo waffleweather restart {' '.join(services or ())}".rstrip(),
                err=True,
            )
            ctx.exit(2)

    console = ctx.obj.get("console") or Console()
    table = Table(title="Restart")
    table.add_column("Unit")
    table.add_column("Result")

    any_failed = False
    for unit in units:
        cmd = systemctl_restart_cmd(unit)
        # If we're root, drop the leading 'sudo'.
        if is_root():
            cmd = cmd[1:]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=30)
        except subprocess.TimeoutExpired:
            table.add_row(unit, "[red]✗ timeout[/red]")
            any_failed = True
            continue
        if result.returncode != 0:
            stderr_first = (
                result.stderr.decode(errors="replace").strip().splitlines()[0]
                if result.stderr
                else ""
            )
            suffix = f": {stderr_first}" if stderr_first else ""
            table.add_row(
                unit,
                f"[red]✗ systemctl exited {result.returncode}{suffix}[/red]",
            )
            any_failed = True
            continue
        # Poll is-active for up to 30s
        deadline = time.monotonic() + 30
        active = False
        while time.monotonic() < deadline:
            if is_active(unit):
                active = True
                break
            time.sleep(2)
        if active:
            table.add_row(unit, "[green]✓ active[/green]")
        else:
            table.add_row(unit, "[red]✗ did not become active within 30s[/red]")
            any_failed = True

    console.print(table)
    if any_failed:
        ctx.exit(1)

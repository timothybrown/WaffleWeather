"""`waffleweather logs [SERVICE]` — wraps journalctl."""

from __future__ import annotations

import os
import sys

import click

from app.cli._systemd import JOURNALCTL, resolve_unit


def _stdout_is_tty() -> bool:
    return sys.stdout.isatty()


@click.command("logs")
@click.argument("service", default="backend")
@click.option("--lines", "-n", default=100, show_default=True, help="Number of lines to show.")
@click.option(
    "--since",
    default="1 hour ago",
    show_default=True,
    help="Time window passed to journalctl (e.g. '1 hour ago', '-30m', '2026-05-15 09:00').",
)
@click.option(
    "--follow/--no-follow",
    default=None,
    help="Tail the journal. Default: follow when stdout is a TTY, one-shot when piped.",
)
def logs_cmd(service: str, lines: int, since: str, follow: bool | None) -> None:
    """Tail journald for a managed unit (default: backend)."""
    unit = resolve_unit(service)
    if follow is None:
        follow = _stdout_is_tty()
    argv = [JOURNALCTL, "-u", unit, "-n", str(lines), "--since", since]
    if follow:
        argv.append("-f")
    # exec into journalctl so signals (ctrl-c) hit the right process.
    os.execvp(JOURNALCTL, argv)

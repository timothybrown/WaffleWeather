"""Output formatting helpers shared across CLI commands."""

from __future__ import annotations

import json
import sys
from enum import StrEnum
from typing import Any

from rich.console import Console
from rich.table import Table


class Severity(StrEnum):
    OK = "ok"
    WARN = "warn"
    FAIL = "fail"


_BADGES = {
    Severity.OK: "[green]✓[/green]",
    Severity.WARN: "[yellow]![/yellow]",
    Severity.FAIL: "[red]✗[/red]",
}


def badge(severity: Severity) -> str:
    """Return a Rich markup string for the given severity."""
    return _BADGES[severity]


def format_age(seconds: float) -> str:
    """Render a duration as human-readable string: 45s, 1m 30s, 1h 1m, 1d 1h."""
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60}s"
    if s < 86400:
        h, rem = divmod(s, 3600)
        return f"{h}h {rem // 60}m"
    d, rem = divmod(s, 86400)
    return f"{d}d {rem // 3600}h"


def summary_line(passed: int, total: int) -> str:
    """One-line summary at the top of status/doctor output."""
    if passed == total:
        return f"✓ {passed}/{total} checks passing"
    return f"✗ {total - passed}/{total} checks failing"


def emit(payload: dict[str, Any], json_output: bool, console: Console | None = None) -> None:
    """Emit a payload either as JSON to stdout or as a Rich-rendered representation."""
    if json_output:
        sys.stdout.write(json.dumps(payload, default=str) + "\n")
        sys.stdout.flush()
        return
    target = console or Console()
    if isinstance(payload, dict):
        table = Table(show_header=False)
        table.add_column("Key")
        table.add_column("Value")
        for k, v in payload.items():
            table.add_row(str(k), str(v))
        target.print(table)
    else:
        target.print(payload)


def make_check_table(title: str) -> Table:
    """Standard table layout used by status and doctor."""
    table = Table(title=title, show_header=True)
    table.add_column("Check", style="bold")
    table.add_column("State", justify="center")
    table.add_column("Detail")
    return table

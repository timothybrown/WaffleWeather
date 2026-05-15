"""Thin wrappers around systemctl and journalctl.

All functions are sync and use short timeouts. None of them invoke privileged
commands; restart/stop/start go through subprocess.run with `sudo` invoked
explicitly by the caller.
"""

from __future__ import annotations

import subprocess
from datetime import datetime, timezone

SYSTEMCTL = "/usr/bin/systemctl"
JOURNALCTL = "/usr/bin/journalctl"

UNIT_ALIASES: dict[str, str] = {
    "backend": "waffleweather-backend",
    "frontend": "waffleweather-frontend",
    "mqtt": "mosquitto",
    "ecowitt": "ecowitt2mqtt",
    "db": "postgresql",
}

MANAGED_UNITS: tuple[str, ...] = (
    "waffleweather-backend",
    "waffleweather-frontend",
    "postgresql",
    "mosquitto",
    "ecowitt2mqtt",
)

# Default scope for `restart` with no args: only the units we directly own.
DEFAULT_RESTART_UNITS: tuple[str, ...] = (
    "waffleweather-backend",
    "waffleweather-frontend",
    "ecowitt2mqtt",
)


def resolve_unit(name: str) -> str:
    """Resolve a friendly alias (backend/frontend/db/...) to a systemd unit name."""
    return UNIT_ALIASES.get(name, name)


def is_active(unit: str, timeout: float = 5.0) -> bool:
    """Return True if `systemctl is-active <unit>` returns 0."""
    try:
        result = subprocess.run(
            [SYSTEMCTL, "is-active", unit],
            capture_output=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    return result.returncode == 0


def is_enabled(unit: str, timeout: float = 5.0) -> bool:
    """Return True if `systemctl is-enabled <unit>` returns 0."""
    try:
        result = subprocess.run(
            [SYSTEMCTL, "is-enabled", unit],
            capture_output=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    return result.returncode == 0


def show_property(unit: str, prop: str, timeout: float = 5.0) -> str:
    """Return the value of a systemd property for the unit, or '' on failure.

    Parses `Property=Value` output from `systemctl show -p <prop> <unit>`.
    """
    try:
        result = subprocess.run(
            [SYSTEMCTL, "show", "-p", prop, unit],
            capture_output=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""
    if result.returncode != 0:
        return ""
    line = result.stdout.decode("utf-8", errors="replace").strip()
    _, _, value = line.partition("=")
    return value


def get_nrestarts(unit: str) -> int:
    """Return the NRestarts counter, or 0 if unavailable/unparseable."""
    value = show_property(unit, "NRestarts")
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0


def get_uptime_seconds(unit: str) -> int | None:
    """Return seconds since the unit's ActiveEnterTimestamp, or None if unparseable."""
    value = show_property(unit, "ActiveEnterTimestampMonotonic")
    if not value:
        return None
    # ActiveEnterTimestampMonotonic is in microseconds since boot; rather than
    # comparing against CLOCK_MONOTONIC, use the wall-clock variant for display.
    wall = show_property(unit, "ActiveEnterTimestamp")
    if not wall or wall == "n/a":
        return None
    # Format example: "Wed 2026-05-14 09:04:33 EDT"
    try:
        parsed = datetime.strptime(wall, "%a %Y-%m-%d %H:%M:%S %Z")
    except ValueError:
        return None
    now = datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        # Best-effort: treat as local
        parsed = parsed.astimezone()
    return max(0, int((now - parsed).total_seconds()))


def systemctl_restart_cmd(unit: str) -> list[str]:
    """Return the exact sudo argv used to restart a unit (matches sudoers grants)."""
    return ["sudo", SYSTEMCTL, "restart", unit]


def journalctl_cmd(unit: str, lines: int, since: str, follow: bool) -> list[str]:
    """Build a journalctl argv for `logs`."""
    args = [JOURNALCTL, "-u", unit, "-n", str(lines), "--since", since]
    if follow:
        args.append("-f")
    return args

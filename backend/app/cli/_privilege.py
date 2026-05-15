"""Privilege detection: check whether the invoking user can run privileged commands.

The CLI never re-execs itself under sudo. If a command needs root, we print a
clear hint telling the user to re-run with `sudo waffleweather ...`.
"""

from __future__ import annotations

import os
import subprocess


def is_root() -> bool:
    """Return True if the current process is running as uid 0."""
    return os.geteuid() == 0


def has_sudo_for(cmd: list[str], timeout: float = 5.0) -> bool:
    """Return True if the invoking user can sudo `cmd` without a password.

    Uses `sudo -n -l <cmd>`: the -n disables password prompts, -l asks sudo
    whether the user is permitted to run that exact command. This does NOT
    actually execute `cmd` — it just consults the sudoers policy.
    """
    try:
        result = subprocess.run(
            ["sudo", "-n", "-l", *cmd],
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    return result.returncode == 0

"""Persistent state for the update command.

State file at /var/lib/waffleweather/update-state.json. Directory ownership
model: mode 2770, owner waffleweather:waffleweather-admin (setgid). File is
owned by the invoking admin user, group waffleweather-admin (inherited via
setgid), mode 0660.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from enum import StrEnum
from pathlib import Path

STATE_DIR = Path("/var/lib/waffleweather")
STATE_FILE_PATH = STATE_DIR / "update-state.json"


class Phase(StrEnum):
    STARTING = "starting"
    CHECKOUT = "checkout"
    DEPS = "deps"
    MIGRATE = "migrate"
    BUILD = "build"
    RESTART = "restart"
    VERIFY = "verify"
    COMPLETE = "complete"
    FAILED = "failed"


# Phases that run before alembic upgrade head. A failure here means the DB
# schema was never touched, so the next attempt can resume from the failed
# phase without re-taking a backup or re-running migrations.
# Apply order: CHECKOUT → DEPS → MIGRATE → BUILD → RESTART → VERIFY.
# Anything from MIGRATE onwards is post-migration and must re-run from
# CHECKOUT (re-backup, re-validate version, re-migrate).
PRE_MIGRATION_PHASES: frozenset[Phase] = frozenset({Phase.CHECKOUT, Phase.DEPS})


@dataclass
class UpdateState:
    phase: Phase
    previous_tag: str
    previous_version: str
    target_tag: str
    started_at: str
    updated_at: str
    backup_path: str | None = None
    restart_skipped: bool = False
    failed_step: str | None = None
    error_summary: str | None = None

    def to_json(self) -> dict[str, object]:
        out: dict[str, object] = {}
        for k, v in asdict(self).items():
            if v is None:
                continue
            out[k] = v
        return out


def read_state() -> UpdateState | None:
    """Return the parsed state, or None if the file is missing or unreadable."""
    if not STATE_FILE_PATH.exists():
        return None
    try:
        raw = json.loads(STATE_FILE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    try:
        return UpdateState(
            phase=Phase(raw["phase"]),
            previous_tag=raw["previous_tag"],
            previous_version=raw["previous_version"],
            target_tag=raw["target_tag"],
            started_at=raw["started_at"],
            updated_at=raw["updated_at"],
            backup_path=raw.get("backup_path"),
            restart_skipped=raw.get("restart_skipped", False),
            failed_step=raw.get("failed_step"),
            error_summary=raw.get("error_summary"),
        )
    except KeyError:
        return None


def write_state(state: UpdateState) -> None:
    """Write the state file atomically with mode 0660."""
    STATE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state.to_json(), indent=2, default=str) + "\n")
    os.chmod(tmp, 0o660)
    tmp.replace(STATE_FILE_PATH)


def delete_state() -> None:
    """Remove the state file if present. No-op when missing."""
    try:
        STATE_FILE_PATH.unlink()
    except FileNotFoundError:
        pass

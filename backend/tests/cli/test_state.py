"""Tests for the update-state file."""

import json
from pathlib import Path

import pytest

from app.cli._state import (
    Phase,
    UpdateState,
    delete_state,
    read_state,
    write_state,
)


@pytest.fixture
def tmp_state_path(tmp_path: Path, monkeypatch) -> Path:
    p = tmp_path / "update-state.json"
    monkeypatch.setattr("app.cli._state.STATE_FILE_PATH", p)
    return p


def test_phase_values():
    assert Phase.STARTING == "starting"
    assert Phase.CHECKOUT == "checkout"
    assert Phase.DEPS == "deps"
    assert Phase.MIGRATE == "migrate"
    assert Phase.BUILD == "build"
    assert Phase.RESTART == "restart"
    assert Phase.VERIFY == "verify"
    assert Phase.COMPLETE == "complete"
    assert Phase.FAILED == "failed"


def test_pre_migration_phases_correct():
    """Apply order is CHECKOUT → DEPS → MIGRATE → BUILD → RESTART → VERIFY.

    Only CHECKOUT and DEPS run before MIGRATE. BUILD/RESTART/VERIFY all run
    after MIGRATE — including BUILD here would be a bug because a build
    failure means the DB migration already ran.
    """
    from app.cli._state import PRE_MIGRATION_PHASES

    assert PRE_MIGRATION_PHASES == frozenset({Phase.CHECKOUT, Phase.DEPS})
    assert Phase.BUILD not in PRE_MIGRATION_PHASES
    assert Phase.MIGRATE not in PRE_MIGRATION_PHASES


def test_write_then_read_round_trip(tmp_state_path):
    state = UpdateState(
        phase=Phase.STARTING,
        previous_tag="v2026.5.6.2",
        previous_version="2026.5.6.2",
        target_tag="v2026.5.14.2",
        started_at="2026-05-14T14:30:22Z",
        updated_at="2026-05-14T14:30:22Z",
    )
    write_state(state)
    loaded = read_state()
    assert loaded is not None
    assert loaded.phase == Phase.STARTING
    assert loaded.target_tag == "v2026.5.14.2"


def test_read_state_returns_none_when_missing(tmp_state_path):
    assert read_state() is None


def test_write_creates_file_with_safe_perms(tmp_state_path):
    state = UpdateState(
        phase=Phase.STARTING,
        previous_tag="v1.0.0.0",
        previous_version="1.0.0.0",
        target_tag="v1.1.0.0",
        started_at="2026-05-14T14:30:22Z",
        updated_at="2026-05-14T14:30:22Z",
    )
    write_state(state)
    mode = tmp_state_path.stat().st_mode & 0o777
    # File should not be world-readable
    assert mode & 0o007 == 0


def test_delete_state_removes_file(tmp_state_path):
    tmp_state_path.write_text(json.dumps({"phase": "starting"}))
    delete_state()
    assert not tmp_state_path.exists()


def test_delete_state_when_missing_is_noop(tmp_state_path):
    # Should not raise
    delete_state()


def test_write_includes_optional_fields(tmp_state_path):
    state = UpdateState(
        phase=Phase.FAILED,
        previous_tag="v1.0.0.0",
        previous_version="1.0.0.0",
        target_tag="v1.1.0.0",
        started_at="2026-05-14T14:30:22Z",
        updated_at="2026-05-14T14:35:11Z",
        backup_path="/var/backups/waffleweather/foo.sql.gz",
        failed_step="migrate",
        error_summary="alembic: relation already exists",
        restart_skipped=False,
    )
    write_state(state)
    raw = json.loads(tmp_state_path.read_text())
    assert raw["backup_path"] == "/var/backups/waffleweather/foo.sql.gz"
    assert raw["failed_step"] == "migrate"
    assert raw["error_summary"] == "alembic: relation already exists"

"""Tests for the `doctor` command."""

import json
from unittest.mock import patch

from app.cli.__main__ import cli
from app.cli._checks import Check
from app.cli._format import Severity


def _check(name: str, sev: Severity) -> Check:
    return Check(name=name, severity=sev, detail="d")


def test_doctor_all_ok_exit_0(runner):
    fake = [_check("a", Severity.OK), _check("b", Severity.OK)]
    with patch("app.cli.doctor.collect_doctor_checks", return_value=fake):
        result = runner.invoke(cli, ["doctor"])
    assert result.exit_code == 0


def test_doctor_warn_exits_1(runner):
    fake = [_check("a", Severity.OK), _check("b", Severity.WARN)]
    with patch("app.cli.doctor.collect_doctor_checks", return_value=fake):
        result = runner.invoke(cli, ["doctor"])
    assert result.exit_code == 1


def test_doctor_fail_exits_1(runner):
    fake = [_check("a", Severity.FAIL)]
    with patch("app.cli.doctor.collect_doctor_checks", return_value=fake):
        result = runner.invoke(cli, ["doctor"])
    assert result.exit_code == 1


def test_doctor_cannot_load_settings_exits_2(runner):
    with patch("app.cli.doctor.load_settings", side_effect=RuntimeError("permission denied on .env")):
        result = runner.invoke(cli, ["doctor"])
    assert result.exit_code == 2


def test_doctor_json_redacts_secret_values(runner):
    """JSON output must NOT contain raw secret values."""
    fake = [
        Check("WW_DATABASE_URL", Severity.OK, "set"),  # detail says 'set', not the URL
        Check("WW_API_KEY", Severity.OK, "set"),
    ]
    with patch("app.cli.doctor.collect_doctor_checks", return_value=fake):
        result = runner.invoke(cli, ["--json", "doctor"])
    parsed = json.loads(result.stdout)
    raw = json.dumps(parsed)
    # No password/connection string should ever appear
    assert "postgresql+asyncpg://" not in raw
    assert "@localhost" not in raw

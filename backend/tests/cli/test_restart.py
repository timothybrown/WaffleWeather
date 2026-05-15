"""Tests for the `restart` command."""

import subprocess
from unittest.mock import patch

from app.cli.__main__ import cli
from app.cli._systemd import DEFAULT_RESTART_UNITS, SYSTEMCTL


def _ok():
    return subprocess.CompletedProcess(args=[], returncode=0, stdout=b"", stderr=b"")


def test_restart_default_units(runner):
    with patch("subprocess.run", return_value=_ok()) as mock_run, \
         patch("app.cli.restart.is_active", return_value=True), \
         patch("app.cli.restart.is_root", return_value=False), \
         patch("app.cli.restart.has_sudo_for", return_value=True):
        result = runner.invoke(cli, ["restart"])
    assert result.exit_code == 0, result.output
    # One sudo systemctl call per default unit
    sudo_calls = [c for c in mock_run.call_args_list if c.args[0][:2] == ["sudo", SYSTEMCTL]]
    units = [c.args[0][3] for c in sudo_calls]
    assert units == list(DEFAULT_RESTART_UNITS)


def test_restart_single_unit_by_alias(runner):
    with patch("subprocess.run", return_value=_ok()) as mock_run, \
         patch("app.cli.restart.is_active", return_value=True), \
         patch("app.cli.restart.is_root", return_value=False), \
         patch("app.cli.restart.has_sudo_for", return_value=True):
        result = runner.invoke(cli, ["restart", "backend"])
    assert result.exit_code == 0, result.output
    sudo_calls = [c for c in mock_run.call_args_list if c.args[0][:2] == ["sudo", SYSTEMCTL]]
    units = [c.args[0][3] for c in sudo_calls]
    assert units == ["waffleweather-backend"]


def test_restart_reports_failure_when_unit_inactive_after(runner):
    # Mock time.sleep + time.monotonic so the 30s polling loop terminates
    # immediately instead of hanging the test for 30 seconds.
    # Sequence yields a monotonically increasing counter; loop body bumps it
    # past `deadline` after 2 iterations so we exercise the loop but exit fast.
    times = iter([0.0, 0.0, 1.0, 100.0, 200.0])

    def _fake_monotonic() -> float:
        try:
            return next(times)
        except StopIteration:
            return 1000.0

    with patch("subprocess.run", return_value=_ok()), \
         patch("app.cli.restart.is_active", return_value=False), \
         patch("app.cli.restart.is_root", return_value=False), \
         patch("app.cli.restart.has_sudo_for", return_value=True), \
         patch("app.cli.restart.time.sleep", lambda _s: None), \
         patch("app.cli.restart.time.monotonic", _fake_monotonic):
        result = runner.invoke(cli, ["restart", "backend"])
    assert result.exit_code == 1, result.output


def test_restart_fails_when_no_sudo(runner):
    with patch("app.cli.restart.has_sudo_for", return_value=False), \
         patch("app.cli.restart.is_root", return_value=False):
        result = runner.invoke(cli, ["restart"])
    assert result.exit_code == 2
    assert "sudo" in result.stdout.lower() or "sudo" in result.stderr.lower()


def test_restart_precheck_lists_all_missing_units(runner):
    """Pre-check must report every unit lacking sudo, not just the first."""

    def grant(cmd):
        # Grant sudo for every unit except waffleweather-frontend
        return cmd[2] != "waffleweather-frontend"

    with patch("app.cli.restart.has_sudo_for", side_effect=grant), \
         patch("app.cli.restart.is_root", return_value=False):
        result = runner.invoke(cli, ["restart", "backend", "frontend"])
    assert result.exit_code == 2
    combined = (result.stdout + result.stderr).lower()
    assert "waffleweather-frontend" in combined

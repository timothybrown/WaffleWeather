"""Tests for the `status` command."""

import json
from unittest.mock import patch

from app.cli.__main__ import cli
from app.cli._checks import Check
from app.cli._format import Severity


def _ok(name: str = "test") -> Check:
    return Check(name=name, severity=Severity.OK, detail="OK")


def _fail(name: str = "test") -> Check:
    return Check(name=name, severity=Severity.FAIL, detail="bad")


def test_status_all_ok_exit_0(runner):
    fake_checks = [_ok("backend"), _ok("postgres"), _ok("free disk")]
    with patch("app.cli.status.collect_status_checks", return_value=fake_checks):
        result = runner.invoke(cli, ["status"])
    assert result.exit_code == 0
    assert "3/3" in result.stdout


def test_status_with_failure_exits_1(runner):
    fake_checks = [_ok("backend"), _fail("postgres")]
    with patch("app.cli.status.collect_status_checks", return_value=fake_checks):
        result = runner.invoke(cli, ["status"])
    assert result.exit_code == 1
    assert "1/2" in result.stdout
    assert "failing" in result.stdout.lower()


def test_status_json_output(runner):
    fake_checks = [_ok("backend"), _fail("postgres")]
    with patch("app.cli.status.collect_status_checks", return_value=fake_checks):
        result = runner.invoke(cli, ["--json", "status"])
    parsed = json.loads(result.stdout)
    assert parsed["backend"]["status"] == "ok"
    assert parsed["postgres"]["status"] == "fail"


def test_status_version_mismatch_fails(monkeypatch):
    """The Backend version check must compare running vs installed."""
    from unittest.mock import MagicMock as MM

    from app.cli.status import collect_status_checks

    fake_settings = MM()
    fake_settings.database_url = ""
    fake_settings.api_key = None
    with patch("app.cli.status.systemd_unit_check") as mock_unit, \
         patch("app.cli.status.backend_http_check") as mock_http, \
         patch("app.cli.status.free_disk_check") as mock_disk, \
         patch("app.cli.status.pkg_version", return_value="2026.5.14.2"), \
         patch("app.cli._checks.backend_http_version", return_value="2026.5.6.2"):
        mock_unit.return_value = Check("u", Severity.OK, "")
        mock_http.return_value = Check("Backend HTTP", Severity.OK, "")
        mock_disk.return_value = Check("Free disk", Severity.OK, "")
        results = collect_status_checks(fake_settings)
    version_check = next(c for c in results if c.name == "Backend version")
    assert version_check.severity == Severity.FAIL
    assert "≠" in version_check.detail

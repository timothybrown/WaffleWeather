"""Tests for the `version` command."""

import json
from unittest.mock import patch

from app.cli.__main__ import cli


def test_version_prints_installed_and_running(runner):
    with (
        patch("app.cli.version.installed_version", return_value="2026.5.14.2"),
        patch("app.cli.version.running_version", return_value="2026.5.14.2"),
    ):
        result = runner.invoke(cli, ["version"])
    assert result.exit_code == 0
    assert "2026.5.14.2" in result.stdout
    assert "matches" in result.stdout.lower()


def test_version_mismatch_exits_1(runner):
    with (
        patch("app.cli.version.installed_version", return_value="2026.5.14.2"),
        patch("app.cli.version.running_version", return_value="2026.5.13.0"),
    ):
        result = runner.invoke(cli, ["version"])
    assert result.exit_code == 1


def test_version_running_unavailable_exits_1(runner):
    with (
        patch("app.cli.version.installed_version", return_value="2026.5.14.2"),
        patch("app.cli.version.running_version", return_value=None),
    ):
        result = runner.invoke(cli, ["version"])
    assert result.exit_code == 1
    assert "unavailable" in result.stdout.lower() or "n/a" in result.stdout.lower()


def test_version_json_output(runner):
    with (
        patch("app.cli.version.installed_version", return_value="2026.5.14.2"),
        patch("app.cli.version.running_version", return_value="2026.5.14.2"),
    ):
        result = runner.invoke(cli, ["--json", "version"])
    assert result.exit_code == 0
    parsed = json.loads(result.stdout)
    assert parsed == {
        "backend_installed": "2026.5.14.2",
        "backend_running": "2026.5.14.2",
        "match": True,
    }

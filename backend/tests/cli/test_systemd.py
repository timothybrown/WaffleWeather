"""Tests for systemd wrappers."""

import subprocess
from unittest.mock import patch

from app.cli._systemd import (
    SYSTEMCTL,
    UNIT_ALIASES,
    get_nrestarts,
    is_active,
    is_enabled,
    resolve_unit,
    show_property,
)


def test_systemctl_path_canonical():
    assert SYSTEMCTL == "/usr/bin/systemctl"


def test_resolve_unit_alias():
    assert resolve_unit("backend") == "waffleweather-backend"
    assert resolve_unit("frontend") == "waffleweather-frontend"
    assert resolve_unit("mqtt") == "mosquitto"
    assert resolve_unit("ecowitt") == "ecowitt2mqtt"
    assert resolve_unit("db") == "postgresql"


def test_resolve_unit_passthrough_for_full_name():
    assert resolve_unit("waffleweather-backend") == "waffleweather-backend"
    assert resolve_unit("mosquitto") == "mosquitto"


def test_is_active_true_when_systemctl_succeeds():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL, "is-active", "x"], returncode=0, stdout=b"active\n", stderr=b""
        )
        assert is_active("waffleweather-backend") is True


def test_is_active_false_when_inactive():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL, "is-active", "x"], returncode=3, stdout=b"inactive\n", stderr=b""
        )
        assert is_active("waffleweather-backend") is False


def test_is_enabled_true():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL, "is-enabled", "x"], returncode=0, stdout=b"enabled\n", stderr=b""
        )
        assert is_enabled("ecowitt2mqtt") is True


def test_show_property_extracts_value():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL, "show", "-p", "NRestarts", "x"],
            returncode=0,
            stdout=b"NRestarts=7\n",
            stderr=b"",
        )
        assert show_property("waffleweather-backend", "NRestarts") == "7"


def test_show_property_returns_empty_on_missing():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL], returncode=0, stdout=b"NRestarts=\n", stderr=b""
        )
        assert show_property("waffleweather-backend", "NRestarts") == ""


def test_get_nrestarts_parses_int():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL], returncode=0, stdout=b"NRestarts=3\n", stderr=b""
        )
        assert get_nrestarts("waffleweather-backend") == 3


def test_get_nrestarts_returns_zero_on_unparseable():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=[SYSTEMCTL], returncode=0, stdout=b"NRestarts=\n", stderr=b""
        )
        assert get_nrestarts("waffleweather-backend") == 0


def test_unit_aliases_contains_required():
    assert "backend" in UNIT_ALIASES
    assert "frontend" in UNIT_ALIASES
    assert "mqtt" in UNIT_ALIASES

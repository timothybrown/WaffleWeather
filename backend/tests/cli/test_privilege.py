"""Tests for sudo / privilege detection."""

import subprocess
from unittest.mock import patch

from app.cli._privilege import has_sudo_for, is_root


def test_is_root_when_euid_zero(monkeypatch):
    monkeypatch.setattr("os.geteuid", lambda: 0)
    assert is_root() is True


def test_is_root_when_euid_nonzero(monkeypatch):
    monkeypatch.setattr("os.geteuid", lambda: 1000)
    assert is_root() is False


def test_has_sudo_for_returns_true_when_sudo_list_succeeds():
    cmd = ["/usr/bin/systemctl", "restart", "waffleweather-backend"]
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["sudo", "-n", "-l", *cmd], returncode=0, stdout=b"", stderr=b""
        )
        assert has_sudo_for(cmd) is True
        # Verify the invocation shape: sudo -n -l <cmd...>
        called_args = mock_run.call_args[0][0]
        assert called_args[:3] == ["sudo", "-n", "-l"]
        assert called_args[3:] == cmd


def test_has_sudo_for_returns_false_when_sudo_list_fails():
    cmd = ["/usr/bin/systemctl", "restart", "waffleweather-backend"]
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["sudo", "-n", "-l", *cmd],
            returncode=1,
            stdout=b"",
            stderr=b"a password is required",
        )
        assert has_sudo_for(cmd) is False


def test_has_sudo_for_returns_false_on_timeout():
    cmd = ["/usr/bin/systemctl", "restart", "waffleweather-backend"]
    with patch("subprocess.run") as mock_run:
        mock_run.side_effect = subprocess.TimeoutExpired(cmd, timeout=5)
        assert has_sudo_for(cmd) is False

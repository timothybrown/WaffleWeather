"""Tests for Docker environment detection."""

from pathlib import Path

from app.cli._docker import DOCKER_MARKER, is_docker_environment


def test_marker_path():
    assert DOCKER_MARKER == Path("/.dockerenv")


def test_detects_when_marker_present(tmp_path, monkeypatch):
    fake_marker = tmp_path / ".dockerenv"
    fake_marker.write_text("")
    monkeypatch.setattr("app.cli._docker.DOCKER_MARKER", fake_marker)
    assert is_docker_environment() is True


def test_does_not_detect_when_marker_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.cli._docker.DOCKER_MARKER", tmp_path / "missing")
    assert is_docker_environment() is False
